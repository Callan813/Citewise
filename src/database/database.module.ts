import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/configuration.js';
import { buildDataSourceOptions } from './typeorm.options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        ...buildDataSourceOptions(config.get('database', { infer: true })),
        // Migrations are a separate deploy step, not something every app
        // instance races to do on boot.
        migrationsRun: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
