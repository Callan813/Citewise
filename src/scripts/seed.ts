import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import argon2 from 'argon2';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { LoggerModule } from '../common/logger/logger.module.js';
import { configuration } from '../config/configuration.js';
import { validateEnv } from '../config/env.validation.js';
import { DatabaseModule } from '../database/database.module.js';
import { DocumentsRepository } from '../documents/documents.repository.js';
import {
  Document,
  DocumentStatus,
  DocumentVisibility,
} from '../documents/entities/document.entity.js';
import { IngestionQueueModule } from '../ingestion/ingestion-queue.module.js';
import { IngestionQueueService } from '../ingestion/ingestion-queue.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { StorageService } from '../storage/storage.service.js';
import { User } from '../users/user.entity.js';
import { readLibrary } from './library.js';

const LIBRARY_OWNER = 'library@citewise.invalid';

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
    TypeOrmModule.forFeature([User]),
    IngestionQueueModule,
    StorageModule,
  ],
  providers: [DocumentsRepository],
})
class SeedModule {}

async function findOrCreateUser(
  db: DataSource,
  email: string,
  passwordHash: string | null,
): Promise<User> {
  const users = db.getRepository(User);
  const existing = await users.findOneBy({ email });
  if (existing) return existing;
  return users.save(users.create({ email, passwordHash }));
}

// Safe to run repeatedly: anything that already exists is left alone. Needs the
// worker running to finish processing the documents it queues.
async function main() {
  const app = await NestFactory.createApplicationContext(SeedModule, {
    bufferLogs: true,
  });
  const log = app.get(Logger);
  app.useLogger(log);

  const db = app.get(DataSource);
  const queue = app.get(IngestionQueueService);
  const storage = app.get(StorageService);
  const documents = app.get(DocumentsRepository);
  await queue.waitUntilReady();

  // No password, so nobody can ever log in as the owner of the public library.
  const owner = await findOrCreateUser(db, LIBRARY_OWNER, null);
  for (const { filename, content } of await readLibrary()) {
    const exists = await db
      .getRepository(Document)
      .existsBy({ userId: owner.id, filename });
    if (exists) continue;

    const storageKey = randomUUID();
    await storage.save(storageKey, content);
    const document = await documents.create({
      userId: owner.id,
      filename,
      mimeType: 'text/plain',
      sizeBytes: content.length,
      storageKey,
      status: DocumentStatus.PROCESSING,
      visibility: DocumentVisibility.PUBLIC,
    });
    await queue.enqueue(document.id);
    log.log(`Queued ${filename}`);
  }

  const demoEmail = process.env.DEMO_EMAIL;
  const demoPassword = process.env.DEMO_PASSWORD;
  if (demoEmail && demoPassword) {
    await findOrCreateUser(
      db,
      demoEmail.toLowerCase(),
      await argon2.hash(demoPassword),
    );
    log.log(`Demo account ready: ${demoEmail}`);
  }

  await app.close();
}
await main();
