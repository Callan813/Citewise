import { CHUNK_OVERLAP, CHUNK_SIZE, chunkPages } from './chunker.js';

describe('chunkPages', () => {
  const page = (content: string, pageNumber = 1) => ({ content, pageNumber });

  it('keeps a short page as one chunk', () => {
    expect(chunkPages([page('Short page.')])).toEqual([
      { chunkIndex: 0, pageNumber: 1, content: 'Short page.' },
    ]);
  });

  it('numbers chunks across pages and keeps real page numbers', () => {
    const chunks = chunkPages([page('First.', 1), page('Third.', 3)]);
    expect(chunks.map((c) => [c.chunkIndex, c.pageNumber])).toEqual([
      [0, 1],
      [1, 3],
    ]);
  });

  it('never exceeds the size limit and loses no text', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`);
    const chunks = chunkPages([page(words.join(' '))]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }
    const combined = chunks.map((c) => c.content).join(' ');
    for (const word of words) expect(combined).toContain(word);
  });

  it('overlaps neighbouring chunks', () => {
    const text = 'x'.repeat(CHUNK_SIZE * 2);
    const [first, second] = chunkPages([page(text)]);
    expect(first.content.length).toBe(CHUNK_SIZE);
    expect(second.content.length).toBeGreaterThan(CHUNK_OVERLAP);
  });

  it('prefers to end a chunk at a sentence', () => {
    const text = `${'a'.repeat(700)}. ${'b'.repeat(700)}`;
    const [first] = chunkPages([page(text)]);
    expect(first.content.endsWith('.')).toBe(true);
  });

  it('finishes on text with no spaces', () => {
    const chunks = chunkPages([page('y'.repeat(50_000))]);
    expect(chunks.length).toBeGreaterThan(50);
  });
});
