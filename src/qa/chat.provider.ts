export interface ChatRequest {
  system: string;
  prompt: string;
  signal?: AbortSignal;
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

// Yields the answer in pieces as it's written. Behind an abstract class so tests
// and offline use don't need the real model.
export abstract class ChatProvider {
  abstract stream(request: ChatRequest): AsyncIterable<string>;
}

// Out of quota or being throttled. The caller should tell the user to try later.
export class ChatRateLimitError extends Error {
  constructor() {
    super('Chat provider rate limit reached');
  }
}
