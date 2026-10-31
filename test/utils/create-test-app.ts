import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { setupApp } from '../../src/app.setup.js';

// Boots the real app against the test database, brings the schema up to date
// with the same migrations production uses, and starts from empty tables.
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  setupApp(app);
  await app.init();

  const db = app.get(DataSource);
  await db.runMigrations();
  await db.query('TRUNCATE TABLE users CASCADE');

  return app;
}
