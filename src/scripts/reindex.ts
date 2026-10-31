import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { LoggerModule } from '../common/logger/logger.module.js';
import { configuration } from '../config/configuration.js';
import { validateEnv } from '../config/env.validation.js';
import { DatabaseModule } from '../database/database.module.js';
import { DocumentsRepository } from '../documents/documents.repository.js';
import { IngestionQueueModule } from '../ingestion/ingestion-queue.module.js';
import { IngestionQueueService } from '../ingestion/ingestion-queue.service.js';

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
    IngestionQueueModule,
  ],
  providers: [DocumentsRepository],
})
class ReindexModule {}

// Queues documents that have no chunks yet, such as ones uploaded before search
// existed. Safe to run again: documents that have chunks are left alone.
async function main() {
  const app = await NestFactory.createApplicationContext(ReindexModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const queue = app.get(IngestionQueueService);
  await queue.waitUntilReady();
  const ids = await app.get(DocumentsRepository).markUnchunkedForProcessing();
  for (const id of ids) await queue.enqueue(id);

  app.get(Logger).log(`Queued ${ids.length} document(s) for indexing`);
  await app.close();
}
await main();
