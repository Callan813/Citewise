import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service.js';
import type { AppConfig } from '../config/configuration.js';
import type { AskSourceDto } from './dto/ask-response.dto.js';

export interface CachedAnswer {
  answer: string;
  sources: AskSourceDto[];
  mode: 'hybrid' | 'keyword';
}

interface SemanticEntry extends CachedAnswer {
  vector: number[];
}

const MAX_SEMANTIC_ENTRIES = 50;

const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

// "What is 2NF?" and "what is 2nf" are the same question.
function normalize(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cosineSimilarity(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += a[i] * b[i];
  return total;
}

// Every key holds the user id AND a fingerprint of the documents they can see.
// So one user can never get an answer built from another's documents, and when
// a document is added or removed, the old answers simply stop being found and
// expire. Nothing has to remember to clear them.
@Injectable()
export class AnswerCacheService {
  constructor(
    private readonly cache: CacheService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async findExact(
    userId: string,
    corpus: string,
    question: string,
  ): Promise<CachedAnswer | null> {
    const raw = await this.cache.get(this.exactKey(userId, corpus, question));
    return raw ? (JSON.parse(raw) as CachedAnswer) : null;
  }

  // A plain scan over at most 50 entries, which is tiny work. Vectors here are
  // already length 1, so their dot product is their cosine similarity.
  async findSimilar(
    userId: string,
    corpus: string,
    vector: number[],
  ): Promise<CachedAnswer | null> {
    const { semanticThreshold } = this.config.get('cache', { infer: true });
    let best: SemanticEntry | null = null;
    let bestScore = semanticThreshold;
    for (const raw of await this.cache.list(this.semanticKey(userId, corpus))) {
      const entry = JSON.parse(raw) as SemanticEntry;
      const score = cosineSimilarity(entry.vector, vector);
      if (score >= bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    if (!best) return null;
    return { answer: best.answer, sources: best.sources, mode: best.mode };
  }

  async store(
    userId: string,
    corpus: string,
    question: string,
    vector: number[] | null,
    answer: CachedAnswer,
  ): Promise<void> {
    const { ttlSeconds } = this.config.get('cache', { infer: true });
    await this.cache.set(
      this.exactKey(userId, corpus, question),
      JSON.stringify(answer),
      ttlSeconds,
    );
    if (vector) {
      await this.cache.pushCapped(
        this.semanticKey(userId, corpus),
        JSON.stringify({ ...answer, vector } satisfies SemanticEntry),
        MAX_SEMANTIC_ENTRIES,
        ttlSeconds,
      );
    }
  }

  private exactKey(userId: string, corpus: string, question: string): string {
    return `qa:exact:${userId}:${corpus}:${sha256(normalize(question))}`;
  }

  private semanticKey(userId: string, corpus: string): string {
    return `qa:semantic:${userId}:${corpus}`;
  }
}
