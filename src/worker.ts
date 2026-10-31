import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module.js';

// A separate process from the API, so heavy PDF parsing can't slow down normal
// requests, and workers can be scaled on their own.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // Runs the graceful close of running jobs when the process is told to stop.
  app.enableShutdownHooks();
  app.get(Logger).log('Ingestion worker started');
}
await bootstrap();
