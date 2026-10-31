import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { MetricsService } from '../../metrics/metrics.service.js';

// Logs one line per request once the response has been sent, with the status
// code and how long it took. This is the raw material for latency metrics later.
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: PinoLogger,
    private readonly metrics: MetricsService,
  ) {
    this.logger.setContext('HTTP');
  }

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      // Query strings can hold sensitive values, so they stay out of the logs.
      const path = req.originalUrl.split('?')[0];
      const entry = {
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      };
      // The pattern, like /documents/:id. See the note in MetricsService.
      const route = (req.route as { path?: string } | undefined)?.path;
      const labels = { method: req.method, route: route ?? 'unmatched' };
      this.metrics.httpRequests.inc({ ...labels, status: res.statusCode });
      this.metrics.httpDuration.observe(labels, durationMs / 1000);

      const msg = `${req.method} ${path} ${res.statusCode}`;

      if (res.statusCode >= 500) this.logger.error(entry, msg);
      else if (res.statusCode >= 400) this.logger.warn(entry, msg);
      else this.logger.info(entry, msg);
    });

    next();
  }
}
