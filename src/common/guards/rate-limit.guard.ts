import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { CacheService } from '../../cache/cache.service.js';
import type { AppConfig } from '../../config/configuration.js';
import { MetricsService } from '../../metrics/metrics.service.js';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator.js';

interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

const RATE_LIMIT_KEY = 'rateLimit';

// Usage: @RateLimit('login', 10, 60) allows 10 requests a minute. Logged-in
// requests count per user, and anonymous ones per IP address.
export const RateLimit = (name: string, limit: number, windowSeconds: number) =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, { name, limit, windowSeconds }),
    UseGuards(RateLimitGuard),
  );

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.get<RateLimitRule>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const who = req.user ? `user:${req.user.id}` : `ip:${req.ip}`;

    const hit = await this.cache.countHit(
      `rate:${rule.name}:${who}`,
      rule.windowSeconds,
    );
    // Fails open: if Redis is down, serve requests. The daily quotas in Postgres
    // still cap spending on the AI provider.
    if (!hit) return true;

    const { multiplier } = this.config.get('limits', { infer: true });
    if (hit.count <= rule.limit * multiplier) return true;

    this.metrics.rateLimited.inc({ rule: rule.name });
    http
      .getResponse<Response>()
      .setHeader('Retry-After', Math.max(hit.ttlSeconds, 1));
    throw new HttpException(
      'Too many requests. Please slow down and try again shortly.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
