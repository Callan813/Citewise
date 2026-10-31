import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import type { AppConfig } from '../config/configuration.js';
import { IngestionQueueService } from '../ingestion/ingestion-queue.service.js';
import { MetricsService } from './metrics.service.js';

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Metrics reveal traffic and internals, so this needs its own token. It uses a
// 404 either way, so the endpoint doesn't advertise itself to anyone scanning.
@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly queue: IngestionQueueService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  async scrape(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { token } = this.config.get('metrics', { infer: true });
    if (!token || !sameSecret(authorization ?? '', `Bearer ${token}`)) {
      throw new NotFoundException();
    }

    try {
      const counts = await this.queue.jobCounts();
      for (const [state, count] of Object.entries(counts)) {
        this.metrics.queueJobs.set({ state }, count);
      }
    } catch {
      // Redis being down shouldn't hide every other metric.
    }

    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}
