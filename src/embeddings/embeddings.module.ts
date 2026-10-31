import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { EmbeddingProvider } from './embedding.provider.js';
import { FakeEmbeddingProvider } from './fake-embedding.provider.js';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider.js';

@Module({
  providers: [
    {
      provide: EmbeddingProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        config.get('ai', { infer: true }).provider === 'fake'
          ? new FakeEmbeddingProvider()
          : new GeminiEmbeddingProvider(config),
    },
  ],
  exports: [EmbeddingProvider],
})
export class EmbeddingsModule {}
