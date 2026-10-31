export interface PageText {
  pageNumber: number;
  content: string;
}

export interface TextChunk {
  chunkIndex: number;
  pageNumber: number;
  content: string;
}

export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;

// Splits each page on its own, so every chunk maps to exactly one page and can
// be cited precisely. The cost: a sentence crossing two pages gets separated.
export function chunkPages(pages: PageText[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  for (const page of pages) {
    for (const content of splitText(page.content)) {
      chunks.push({
        chunkIndex: chunks.length,
        pageNumber: page.pageNumber,
        content,
      });
    }
  }
  return chunks;
}

// The overlap means an idea cut at one boundary still appears whole in a chunk.
function splitText(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    if (end >= text.length) {
      end = text.length;
    } else {
      end = findBreak(text, start, end);
    }
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return parts;
}

// Prefers to cut at a paragraph, then a sentence, then a word. It only looks in
// the second half of the chunk, so a chunk never ends up tiny, and always moves
// past the overlap so the loop can't get stuck.
function findBreak(text: string, start: number, limit: number): number {
  const earliest = start + Math.floor(CHUNK_SIZE / 2);
  const window = text.slice(earliest, limit);
  for (const separator of ['\n\n', '. ', '\n', ' ']) {
    const position = window.lastIndexOf(separator);
    if (position !== -1) return earliest + position + separator.length;
  }
  return limit;
}
