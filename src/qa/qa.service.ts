import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SearchResultDto } from '../search/dto/search-response.dto.js';
import { SearchService } from '../search/search.service.js';
import { ChatProvider, ChatRateLimitError } from './chat.provider.js';
import type { AskResponseDto, AskSourceDto } from './dto/ask-response.dto.js';
import { buildPrompt, NOT_FOUND_ANSWER, SYSTEM_PROMPT } from './prompt.js';

const MAX_PASSAGES = 5;
export const BUSY_MESSAGE =
  'The AI service is busy or has reached its limit. Please try again later.';
export const FAILED_MESSAGE = 'The answer could not be generated.';

export interface Retrieval {
  mode: 'hybrid' | 'keyword';
  passages: SearchResultDto[];
}

@Injectable()
export class QaService {
  constructor(
    private readonly search: SearchService,
    private readonly chat: ChatProvider,
  ) {}

  // Uses the same search as everything else, so a user's question can only ever
  // reach passages that user is allowed to see.
  async retrieve(userId: string, question: string): Promise<Retrieval> {
    const { mode, results } = await this.search.search(
      userId,
      question,
      MAX_PASSAGES,
    );
    return { mode, passages: results };
  }

  // With nothing relevant, the model is never called. It can't make up an answer
  // from no evidence, and the request costs no quota.
  async *generate(
    question: string,
    passages: SearchResultDto[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    if (passages.length === 0) {
      yield NOT_FOUND_ANSWER;
      return;
    }
    yield* this.chat.stream({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(question, passages),
      signal,
    });
  }

  async ask(userId: string, question: string): Promise<AskResponseDto> {
    const { mode, passages } = await this.retrieve(userId, question);
    let answer = '';
    try {
      for await (const text of this.generate(question, passages)) {
        answer += text;
      }
    } catch (err) {
      throw new ServiceUnavailableException(userMessageFor(err));
    }
    if (!answer.trim()) {
      throw new ServiceUnavailableException(FAILED_MESSAGE);
    }
    return { answer, sources: citedSources(answer, passages), mode };
  }
}

// Provider errors can include internal details, so only fixed text reaches users.
export function userMessageFor(err: unknown): string {
  return err instanceof ChatRateLimitError ? BUSY_MESSAGE : FAILED_MESSAGE;
}

// Shows the passages the answer actually used. Numbers stay as the model wrote
// them, so [2] in the text still matches source 2 even if source 1 wasn't cited.
export function citedSources(
  answer: string,
  passages: SearchResultDto[],
): AskSourceDto[] {
  if (answer.trim().startsWith(NOT_FOUND_ANSWER)) return [];

  const cited = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const number of match[1].split(',')) cited.add(Number(number));
  }
  return passages.flatMap((passage, i) =>
    // If the model forgot to cite anything, show everything it was given.
    cited.size === 0 || cited.has(i + 1)
      ? [
          {
            number: i + 1,
            documentId: passage.documentId,
            filename: passage.filename,
            pageNumber: passage.pageNumber,
            content: passage.content,
          },
        ]
      : [],
  );
}
