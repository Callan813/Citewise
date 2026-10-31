import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsRepository } from './documents.repository.js';
import { DocumentsService } from './documents.service.js';
import { TextExtractorService } from './text-extractor.service.js';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsRepository, DocumentsService, TextExtractorService],
})
export class DocumentsModule {}
