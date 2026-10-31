import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { EmbeddingProvider } from '../embeddings/embedding.provider.js';
import type { SearchResponseDto } from './dto/search-response.dto.js';
import { SearchRepository } from './search.repository.js';

@Injectable()
export class SearchService {
  constructor(
    private readonly repository: SearchRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SearchService.name);
  }

  async search(
    userId: string,
    query: string,
    limit: number,
  ): Promise<SearchResponseDto> {
    // If the embedding provider is down or out of quota, keyword results are
    // still far better than an error.
    let vector: number[] | null = null;
    try {
      vector = await this.embeddings.embedQuery(query);
    } catch (err) {
      this.logger.warn({ err }, 'Falling back to keyword-only search');
    }

    const rows = await this.repository.search(userId, query, vector, limit);
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
