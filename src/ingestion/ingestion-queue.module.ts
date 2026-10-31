import { Module } from '@nestjs/common';
import { IngestionQueueService } from './ingestion-queue.service.js';

@Module({
  providers: [IngestionQueueService],
  exports: [IngestionQueueService],
})
export class IngestionQueueModule {}
