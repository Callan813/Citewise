import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingProvider,
  normalize,
} from './embedding.provider.js';

// For tests and working offline: free and repeatable. Texts sharing words get
// similar vectors, so search behaves sensibly, but it has no idea what words
// mean, so it says nothing about the quality of real search results.
@Injectable()
export class FakeEmbeddingProvider extends EmbeddingProvider {
  embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.vectorFor(text)));
  }

  embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(this.vectorFor(text));
  }

  private vectorFor(text: string): number[] {
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
    vector[0] = 0.001; // so an empty text can't produce an all-zero vector
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      const hash = createHash('sha256').update(word).digest();
      vector[hash.readUInt32BE(0) % EMBEDDING_DIMENSIONS] += 1;
    }
    return normalize(vector);
  }
}
