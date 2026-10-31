import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { DocumentPage } from '../documents/entities/document-page.entity.js';
import { Document } from '../documents/entities/document.entity.js';
import { User } from '../users/user.entity.js';
import { migrations } from './migrations/index.js';

// Entities and migrations are listed explicitly instead of found by a file glob.
// Globs break depending on whether code runs from src/ (tests) or dist/ (prod);
// an explicit list behaves the same everywhere. The cost: register new ones here.
export const entities = [User, Document, DocumentPage];

export function buildDataSourceOptions(
  db: AppConfig['database'],
): DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.name,
    entities,
    migrations,
    // Never let the ORM change the schema on its own. Every schema change is a
    // reviewed migration file that runs the same way in dev, CI and production.
    synchronize: false,
    migrationsTableName: 'migrations',
    // Use Postgres's built-in gen_random_uuid() rather than uuid-ossp.
    uuidExtension: 'pgcrypto',
  };
}
