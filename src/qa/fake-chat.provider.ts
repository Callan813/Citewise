import { Injectable } from '@nestjs/common';
import { type ChatRequest, ChatProvider } from './chat.provider.js';

// For tests and working offline. Quotes the first passage rather than thinking,
// so it proves the pipeline works and says nothing about answer quality.
@Injectable()
export class FakeChatProvider extends ChatProvider {
  async *stream(request: ChatRequest): AsyncIterable<string> {
    const passage = /<passage[^>]*>\n?([\s\S]*?)\n?<\/passage>/.exec(
      request.prompt,
    );
    const text = `From your documents: ${passage?.[1].slice(0, 120) ?? ''} [1]`;
    for (const word of text.split(/(?<=\s)/)) yield word;
  }
}
