import { Module } from '@nestjs/common';
import { IngestionQueueModule } from '../ingestion/ingestion-queue.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsRepository } from './documents.repository.js';
import { DocumentsService } from './documents.service.js';
import { TextExtractorService } from './text-extractor.service.js';

@Module({
  imports: [IngestionQueueModule, StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsRepository, DocumentsService, TextExtractorService],
})
export class DocumentsModule {}
