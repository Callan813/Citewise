import { Global, Module } from '@nestjs/common';
import { IngestionQueueModule } from '../ingestion/ingestion-queue.module.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

@Global()
@Module({
  imports: [IngestionQueueModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
