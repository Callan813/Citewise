import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator.js';
import { IngestionQueueService } from '../ingestion/ingestion-queue.service.js';

@ApiTags('System')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly db: TypeOrmHealthIndicator,
    private readonly indicators: HealthIndicatorService,
    private readonly queue: IngestionQueueService,
  ) {}

  // Returns 503 if any check fails, so a load balancer stops sending traffic
  // to this instance.
  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Service and dependencies are healthy' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is down' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
      () => this.checkRedis(),
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  private async checkRedis() {
    const redis = this.indicators.check('redis');
    try {
      await this.queue.ping();
      return redis.up();
    } catch {
      return redis.down('Redis is not reachable');
    }
  }
}
