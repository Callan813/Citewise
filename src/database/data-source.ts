import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { configuration } from '../config/configuration.js';
import { validateEnv } from '../config/env.validation.js';
import { buildDataSourceOptions } from './typeorm.options.js';

// Used only by the TypeORM CLI (npm run migration:*). The running app gets its
// connection from DatabaseModule instead. Both use buildDataSourceOptions, so
// they can't drift apart.
if (existsSync('.env')) process.loadEnvFile('.env');
validateEnv(process.env);

export default new DataSource(buildDataSourceOptions(configuration().database));
