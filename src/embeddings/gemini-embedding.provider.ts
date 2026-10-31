import { ApiError, GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProvider,
  EmbeddingRateLimitError,
  normalize,
} from './embedding.provider.js';

const MODEL = 'gemini-embedding-001';
const DEFAULT_RETRY_MS = 60_000;

@Injectable()
export class GeminiEmbeddingProvider extends EmbeddingProvider {
  private readonly client: GoogleGenAI;

  constructor(config: ConfigService<AppConfig, true>) {
    super();
    this.client = new GoogleGenAI({
      apiKey: config.get('gemini', { infer: true }).apiKey,
    });
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.embed(texts, 'RETRIEVAL_DOCUMENT');
  }

  // Questions and passages use different task types, because the model handles
  // them differently to help match a question with the passage that answers it.
  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embed([text], 'RETRIEVAL_QUERY');
    return vector;
  }

  private async embed(texts: string[], taskType: string): Promise<number[][]> {
    try {
      const response = await this.client.models.embedContent({
        model: MODEL,
        contents: texts,
        config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
      });
      const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
      if (vectors.length !== texts.length) {
        throw new Error(
          `Expected ${texts.length} embeddings, got ${vectors.length}`,
        );
      }
      return vectors.map(normalize);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        throw new EmbeddingRateLimitError(retryDelayMs(err.message));
      }
      throw err;
    }
  }
}

function retryDelayMs(message: string): number {
  const seconds = /retry in ([\d.]+)s/i.exec(message)?.[1];
  return seconds ? Math.ceil(Number(seconds) * 1000) : DEFAULT_RETRY_MS;
}
