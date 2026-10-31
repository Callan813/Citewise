import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator.js';

@ApiTags('System')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  // Returns 503 if any check fails, so a load balancer stops sending traffic
  // to this instance. A Redis check joins once the app uses Redis.
  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Service and dependencies are healthy' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is down' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }
}
