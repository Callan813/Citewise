import { Module } from '@nestjs/common';
import { DocumentsRepository } from '../documents/documents.repository.js';
import { TextExtractorService } from '../documents/text-extractor.service.js';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { IngestionProcessor } from './ingestion.processor.js';

@Module({
  imports: [StorageModule, EmbeddingsModule],
  providers: [DocumentsRepository, TextExtractorService, IngestionProcessor],
})
export class IngestionWorkerModule {}
