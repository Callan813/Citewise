import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { AppConfig } from '../config/configuration.js';

const COUNT_IN_WINDOW = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return { count, redis.call('TTL', KEYS[1]) }
`;

// A separate Redis from the job queue: this one may drop old keys when full,
// while queued jobs must never be dropped.
//
// Every method survives Redis being down. A cache outage should make the app
// slower, not break it, so failures read as a miss.
@Injectable()
export class CacheService implements OnApplicationShutdown {
  private readonly redis: Redis;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CacheService.name);
    this.redis = new Redis({
      ...config.get('cacheRedis', { infer: true }),
      enableOfflineQueue: false, // fail right away rather than wait
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (err) => {
      this.logger.warn({ err }, 'Cache connection error');
    });
  }

  async get(key: string): Promise<string | null> {
    return this.attempt(() => this.redis.get(key), null);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.attempt(
      () => this.redis.set(key, value, 'EX', ttlSeconds),
      null,
    );
  }

  // Adds to a list that keeps only its newest entries.
  async pushCapped(
    key: string,
    value: string,
    cap: number,
    ttlSeconds: number,
  ): Promise<void> {
    await this.attempt(
      () =>
        this.redis
          .multi()
          .lpush(key, value)
          .ltrim(key, 0, cap - 1)
          .expire(key, ttlSeconds)
          .exec(),
      null,
    );
  }

  async list(key: string): Promise<string[]> {
    return this.attempt(() => this.redis.lrange(key, 0, -1), []);
  }

  // Counts a hit in a fixed time window. The script runs atomically, so a crash
  // can't leave a counter that never expires. Null means Redis is unavailable.
  async countHit(
    key: string,
    windowSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number } | null> {
    return this.attempt(async () => {
      const [count, ttlSeconds] = (await this.redis.eval(
        COUNT_IN_WINDOW,
        1,
        key,
        windowSeconds,
      )) as [number, number];
      return { count, ttlSeconds };
    }, null);
  }

  async waitUntilReady(): Promise<void> {
    if (this.redis.status === 'ready') return;
    await new Promise((resolve) => this.redis.once('ready', resolve));
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }

  private async attempt<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (err) {
      this.logger.warn({ err }, 'Cache command failed');
      return fallback;
    }
  }
}
