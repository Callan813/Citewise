// Fixed by the database column. Changing it means a migration and re-embedding
// every document, because vectors of different sizes can't be compared.
export const EMBEDDING_DIMENSIONS = 768;

// Callers only know "text in, vectors out", so swapping Gemini for another
// provider, or for the fake one in tests, doesn't touch anything else.
export abstract class EmbeddingProvider {
  abstract embedDocuments(texts: string[]): Promise<number[][]>;
  abstract embedQuery(text: string): Promise<number[]>;
}

// The provider asked us to slow down. Not a real failure, so it shouldn't use up
// a job's retries.
export class EmbeddingRateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Embedding provider rate limit reached');
  }
}

// Scales a vector to length 1. Cosine distance needs comparable lengths, and
// Gemini only normalizes its full-size vectors, not shortened ones.
export function normalize(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  return length === 0 ? vector : vector.map((value) => value / length);
}
