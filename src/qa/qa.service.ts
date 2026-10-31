import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service.js';
import type { SearchResultDto } from '../search/dto/search-response.dto.js';
import { SearchService } from '../search/search.service.js';
import { UsageService } from '../usage/usage.service.js';
import {
  AnswerCacheService,
  type CachedAnswer,
} from './answer-cache.service.js';
import { ChatProvider, ChatRateLimitError } from './chat.provider.js';
import type { AskResponseDto, AskSourceDto } from './dto/ask-response.dto.js';
import { buildPrompt, NOT_FOUND_ANSWER, SYSTEM_PROMPT } from './prompt.js';

const MAX_PASSAGES = 5;
export const BUSY_MESSAGE =
  'The AI service is busy or has reached its limit. Please try again later.';
export const FAILED_MESSAGE = 'The answer could not be generated.';

// Everything worked out before an answer starts being written. Failures here,
// such as a used-up quota, can still be normal HTTP errors.
export interface PreparedQuestion {
  userId: string;
  question: string;
  corpus: string;
  vector: number[] | null;
  mode: 'hybrid' | 'keyword';
  passages: SearchResultDto[];
  cached: CachedAnswer | null;
}

@Injectable()
export class QaService {
  constructor(
    private readonly search: SearchService,
    private readonly chat: ChatProvider,
    private readonly cache: AnswerCacheService,
    private readonly usage: UsageService,
    private readonly metrics: MetricsService,
  ) {}

  // Cheapest checks first: exact match, then similar question, then a search.
  // Quota is only spent when the model will really be called.
  async prepare(userId: string, question: string): Promise<PreparedQuestion> {
    const corpus = await this.search.corpusFingerprint(userId);
    const base = { userId, question, corpus };

    const exact = await this.cache.findExact(userId, corpus, question);
    if (exact) {
      this.metrics.answers.inc({ source: 'cache_exact' });
      return {
        ...base,
        vector: null,
        mode: exact.mode,
        passages: [],
        cached: exact,
      };
    }

    const vector = await this.search.embedQuery(question);
    if (vector) {
      const similar = await this.cache.findSimilar(userId, corpus, vector);
      if (similar) {
        this.metrics.answers.inc({ source: 'cache_semantic' });
        return {
          ...base,
          vector,
          mode: similar.mode,
          passages: [],
          cached: similar,
        };
      }
    }

    // Uses the same search as everything else, so a user's question can only
    // ever reach passages that user is allowed to see.
    const { mode, results } = await this.search.search(
      userId,
      question,
      MAX_PASSAGES,
      vector,
    );
    if (results.length === 0) {
      this.metrics.answers.inc({ source: 'no_passages' });
    } else {
      await this.usage.consumeQuestion(userId);
    }
    return { ...base, vector, mode, passages: results, cached: null };
  }

  // With nothing relevant, the model is never called. It can't make up an answer
  // from no evidence, and the request costs no quota.
  async *generate(
    prepared: PreparedQuestion,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    if (prepared.cached) {
      yield prepared.cached.answer;
      return;
    }
    if (prepared.passages.length === 0) {
      yield NOT_FOUND_ANSWER;
      return;
    }
    this.metrics.answers.inc({ source: 'model' });
    yield* this.chat.stream({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(prepared.question, prepared.passages),
      signal,
      onUsage: (usage) =>
        void this.usage
          .addTokens(prepared.userId, usage.inputTokens, usage.outputTokens)
          .catch(() => undefined), // accounting must never break an answer
    });
  }

  // Turns a finished answer into the response, and remembers it for next time.
  async finish(
    prepared: PreparedQuestion,
    answer: string,
  ): Promise<AskResponseDto> {
    if (prepared.cached) return { ...prepared.cached, cached: true };

    const sources = citedSources(answer, prepared.passages);
    const result = { answer, sources, mode: prepared.mode };
    // "Not found" is cheap to work out again and could stop being true.
    if (sources.length > 0) {
      await this.cache.store(
        prepared.userId,
        prepared.corpus,
        prepared.question,
        prepared.vector,
        result,
      );
    }
    return { ...result, cached: false };
  }

  async ask(userId: string, question: string): Promise<AskResponseDto> {
    const prepared = await this.prepare(userId, question);
    let answer = '';
    try {
      for await (const text of this.generate(prepared)) answer += text;
    } catch (err) {
      throw new ServiceUnavailableException(userMessageFor(err));
    }
    if (!answer.trim()) {
      throw new ServiceUnavailableException(FAILED_MESSAGE);
    }
    return this.finish(prepared, answer);
  }
}

// Provider errors can include internal details, so only fixed text reaches users.
export function userMessageFor(err: unknown): string {
  return err instanceof ChatRateLimitError ? BUSY_MESSAGE : FAILED_MESSAGE;
}

// Shows the passages the answer actually used. Numbers stay as the model wrote
// them, so [2] in the text still matches source 2 even if source 1 wasn't cited.
export function citedSources(
  answer: string,
  passages: SearchResultDto[],
): AskSourceDto[] {
  if (answer.trim().startsWith(NOT_FOUND_ANSWER)) return [];

  const cited = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const number of match[1].split(',')) cited.add(Number(number));
  }
  return passages.flatMap((passage, i) =>
    // If the model forgot to cite anything, show everything it was given.
    cited.size === 0 || cited.has(i + 1)
      ? [
          {
            number: i + 1,
            documentId: passage.documentId,
            filename: passage.filename,
            pageNumber: passage.pageNumber,
            content: passage.content,
          },
        ]
      : [],
  );
}
