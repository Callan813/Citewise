import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from './common/logger/logger.module.js';
import { configuration } from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { IngestionWorkerModule } from './ingestion/ingestion-worker.module.js';

// The worker's root module. It has no controllers or HTTP server.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule,
    DatabaseModule,
    IngestionWorkerModule,
  ],
})
export class WorkerModule {}
