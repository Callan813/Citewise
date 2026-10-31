import { ApiError, GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import {
  type ChatRequest,
  ChatProvider,
  ChatRateLimitError,
} from './chat.provider.js';

@Injectable()
export class GeminiChatProvider extends ChatProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(config: ConfigService<AppConfig, true>) {
    super();
    const gemini = config.get('gemini', { infer: true });
    this.client = new GoogleGenAI({ apiKey: gemini.apiKey });
    this.model = gemini.chatModel;
  }

  async *stream(request: ChatRequest): AsyncIterable<string> {
    try {
      const response = await this.client.models.generateContentStream({
        model: this.model,
        contents: request.prompt,
        config: {
          systemInstruction: request.system,
          temperature: 0.2, // stay close to the passages rather than be creative
          maxOutputTokens: 2048,
          abortSignal: request.signal,
        },
      });
      for await (const chunk of response) {
        if (chunk.text) yield chunk.text;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        throw new ChatRateLimitError();
      }
      throw err;
    }
  }
}
