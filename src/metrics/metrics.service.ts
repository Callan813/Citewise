import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  // "route" is the pattern like /documents/:id, never the real URL. A label per
  // document id would create endless series and overload Prometheus.
  readonly httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'HTTP requests handled',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'How long HTTP requests took',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [this.registry],
  });

  readonly answers = new Counter({
    name: 'qa_answers_total',
    help: 'Questions answered, by how the answer was produced',
    labelNames: ['source'], // model, cache_exact, cache_semantic, no_passages
    registers: [this.registry],
  });

  readonly aiTokens = new Counter({
    name: 'ai_tokens_total',
    help: 'Tokens used by the chat model',
    labelNames: ['direction'], // input, output
    registers: [this.registry],
  });

  readonly rateLimited = new Counter({
    name: 'rate_limited_requests_total',
    help: 'Requests rejected by rate limits',
    labelNames: ['rule'],
    registers: [this.registry],
  });

  readonly quotaRejected = new Counter({
    name: 'quota_rejections_total',
    help: 'Requests rejected by daily quotas',
    labelNames: ['kind'],
    registers: [this.registry],
  });

  readonly queueJobs = new Gauge({
    name: 'ingestion_queue_jobs',
    help: 'Jobs in the ingestion queue, by state',
    labelNames: ['state'],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
