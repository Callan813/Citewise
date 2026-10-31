import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { SearchModule } from '../search/search.module.js';
import { ChatProvider } from './chat.provider.js';
import { FakeChatProvider } from './fake-chat.provider.js';
import { GeminiChatProvider } from './gemini-chat.provider.js';
import { QaController } from './qa.controller.js';
import { QaService } from './qa.service.js';

@Module({
  imports: [SearchModule],
  controllers: [QaController],
  providers: [
    QaService,
    {
      provide: ChatProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        config.get('ai', { infer: true }).provider === 'fake'
          ? new FakeChatProvider()
          : new GeminiChatProvider(config),
    },
  ],
})
export class QaModule {}
