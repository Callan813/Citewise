import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { SearchController } from './search.controller.js';
import { SearchRepository } from './search.repository.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [EmbeddingsModule],
  controllers: [SearchController],
  providers: [SearchRepository, SearchService],
  exports: [SearchService],
})
export class SearchModule {}
