import { rm } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { IngestionQueueService } from '../../src/ingestion/ingestion-queue.service.js';
import { IngestionWorkerModule } from '../../src/ingestion/ingestion-worker.module.js';
import { setupApp } from '../../src/app.setup.js';

// Boots the real app and a real worker against the test database and a separate
// Redis database, brings the schema up to date with the same migrations
// production uses, and starts from empty tables.
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication<App>> {
  const moduleRef = await customize(
    Test.createTestingModule({
      imports: [AppModule, IngestionWorkerModule],
    }),
  ).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  setupApp(app);
  await app.init();

  const db = app.get(DataSource);
  await db.runMigrations();
  await db.query('TRUNCATE TABLE users CASCADE');
  await rm(process.env.STORAGE_DIR!, { recursive: true, force: true });
  await app.get(IngestionQueueService).waitUntilReady();

  return app;
}
