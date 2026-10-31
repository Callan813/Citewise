import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface LibraryFile {
  filename: string;
  content: Buffer;
}

// The notes shipped with the project, used by both seeding and the evaluation.
export async function readLibrary(): Promise<LibraryFile[]> {
  const folder = resolve('seed', 'library');
  const names = (await readdir(folder)).filter((name) => name.endsWith('.txt'));
  return Promise.all(
    names.map(async (filename) => ({
      filename,
      content: await readFile(join(folder, filename)),
    })),
  );
}
