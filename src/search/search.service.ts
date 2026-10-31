import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { AppConfig } from '../config/configuration.js';
import { EmbeddingProvider } from '../embeddings/embedding.provider.js';
import type { SearchResponseDto } from './dto/search-response.dto.js';
import { SearchRepository } from './search.repository.js';

@Injectable()
export class SearchService {
  constructor(
    private readonly repository: SearchRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly logger: PinoLogger,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    this.logger.setContext(SearchService.name);
  }

  corpusFingerprint(userId: string): Promise<string> {
    return this.repository.corpusFingerprint(userId);
  }

  // If the embedding provider is down or out of quota, keyword results are still
  // far better than an error, so this returns null rather than throwing.
  async embedQuery(query: string): Promise<number[] | null> {
    try {
      return await this.embeddings.embedQuery(query);
    } catch (err) {
      this.logger.warn({ err }, 'Falling back to keyword-only search');
      return null;
    }
  }

  // Callers that already embedded the query can pass the vector, or null if that
  // failed, so it isn't embedded twice.
  async search(
    userId: string,
    query: string,
    limit: number,
    knownVector?: number[] | null,
  ): Promise<SearchResponseDto> {
    const vector =
      knownVector === undefined ? await this.embedQuery(query) : knownVector;

    const rows = await this.repository.search(
      userId,
      query,
      vector,
      limit,
      this.config.get('search', { infer: true }).maxDistance,
    );
    return {
      mode: vector ? 'hybrid' : 'keyword',
      results: rows.map((row) => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        filename: row.filename,
        pageNumber: row.page_number,
        content: row.content,
        score: row.score,
      })),
    };
  }
}
