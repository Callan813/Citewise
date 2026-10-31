import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { IngestionQueueModule } from '../ingestion/ingestion-queue.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, IngestionQueueModule],
  controllers: [HealthController],
})
export class HealthModule {}
