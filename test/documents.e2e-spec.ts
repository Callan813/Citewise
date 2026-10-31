import type { INestApplication } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { DocumentsRepository } from '../src/documents/documents.repository.js';
import { IngestionQueueService } from '../src/ingestion/ingestion-queue.service.js';
import { IngestionProcessor } from '../src/ingestion/ingestion.processor.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createTestApp } from './utils/create-test-app.js';

async function makePdf(pages: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (const text of pages) {
    const page = pdf.addPage();
    if (text) page.drawText(text);
  }
  return Buffer.from(await pdf.save());
}

describe('Documents (e2e)', () => {
  let app: INestApplication<App>;
  let priya: string;
  let rahul: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const upload = (token: string, file: Buffer, name: string) =>
    request(app.getHttpServer())
      .post('/documents/upload')
      .set(auth(token))
      .attach('file', file, name);

  // Uploads return before the worker has run, so tests wait for the outcome.
  const waitForDocument = async (token: string, id: string, ms = 10_000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get(`/documents/${id}`)
        .set(auth(token))
        .expect(200);
      if (res.body.status !== 'processing') return res.body;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Document ${id} was still processing after ${ms}ms`);
  };

  const register = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'long-enough-password' })
      .expect(201);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    priya = await register('priya@example.com');
    rahul = await register('rahul@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('upload', () => {
    it('requires a token', async () => {
      await request(app.getHttpServer())
        .post('/documents/upload')
        .attach('file', Buffer.from('hello'), 'a.txt')
        .expect(401);
    });

    it('stores a PDF with real page numbers, skipping blank pages', async () => {
      const pdf = await makePdf(['First page text', '', 'Third page text']);
      const res = await upload(priya, pdf, 'notes.pdf').expect(202);

      expect(res.body).toMatchObject({
        filename: 'notes.pdf',
        mimeType: 'application/pdf',
        pageCount: 0,
        status: 'processing',
        visibility: 'private',
        isOwner: true,
      });
      expect(res.body).not.toHaveProperty('userId');
      expect(res.body).not.toHaveProperty('storageKey');

      const done = await waitForDocument(priya, res.body.id);
      expect(done).toMatchObject({
        status: 'ready',
        pageCount: 2,
        error: null,
      });

      const page = await request(app.getHttpServer())
        .get(`/documents/${res.body.id}/pages/3`)
        .set(auth(priya))
        .expect(200);
      expect(page.body.content).toContain('Third page text');

      const numbers = await request(app.getHttpServer())
        .get(`/documents/${res.body.id}/pages`)
        .set(auth(priya))
        .expect(200);
      expect(numbers.body.pageNumbers).toEqual([1, 3]);

      await request(app.getHttpServer())
        .get(`/documents/${res.body.id}/pages/2`)
        .set(auth(priya))
        .expect(404);
    });

    it('splits long text files into pages', async () => {
      const res = await upload(
        priya,
        Buffer.from('a'.repeat(7000)),
        'long.txt',
      ).expect(202);
      expect(res.body.mimeType).toBe('text/plain');

      const done = await waitForDocument(priya, res.body.id);
      expect(done.pageCount).toBe(3);
    });

    it('judges files by their bytes, not their name', async () => {
      const binary = Buffer.from([0x4d, 0x5a, 0x00, 0xff, 0xfe, 0x00]);
      await upload(priya, binary, 'totally-notes.pdf').expect(415);
    });

    it('marks a PDF with no text as failed without retrying', async () => {
      const res = await upload(priya, await makePdf(['']), 'scan.pdf').expect(
        202,
      );
      // Well under the retry backoff, so this proves there was no retry.
      const done = await waitForDocument(priya, res.body.id, 1500);
      expect(done.status).toBe('failed');
      expect(done.error).toContain('No readable text');
    });

    it('marks a corrupt PDF as failed', async () => {
      const res = await upload(
        priya,
        Buffer.from('%PDF-1.7 garbage'),
        'bad.pdf',
      ).expect(202);
      const done = await waitForDocument(priya, res.body.id);
      expect(done.status).toBe('failed');
      expect(done.error).toContain('could not be read');
    });

    it('retries unexpected errors, then gives up with a generic message', async () => {
      // A file missing from storage is the kind of error that might be temporary.
      const [{ id: userId }] = await app
        .get(DataSource)
        .query('SELECT id FROM users WHERE email = $1', ['priya@example.com']);
      const document = await app.get(DocumentsRepository).create({
        userId,
        filename: 'missing.txt',
        mimeType: 'text/plain',
        sizeBytes: 1,
        storageKey: 'does-not-exist',
      });
      await app.get(IngestionQueueService).enqueue(document.id);

      const done = await waitForDocument(priya, document.id, 15_000);
      expect(done.status).toBe('failed');
      expect(done.error).toBe('Processing failed. Please try uploading again.');
      expect(done.error).not.toContain('does-not-exist');
    }, 20_000);

    it('can process the same document twice without duplicating pages', async () => {
      const res = await upload(priya, Buffer.from('hello'), 'twice.txt');
      await waitForDocument(priya, res.body.id);

      const db = app.get(DataSource);
      await db.query(
        `UPDATE documents SET status = 'processing' WHERE id = $1`,
        [res.body.id],
      );
      await app.get(IngestionProcessor).process(res.body.id);

      const done = await waitForDocument(priya, res.body.id);
      expect(done).toMatchObject({ status: 'ready', pageCount: 1 });
    });

    it('removes the stored file when the document is deleted', async () => {
      const res = await upload(priya, Buffer.from('bye'), 'bye.txt');
      await waitForDocument(priya, res.body.id);
      const [{ storage_key: key }] = await app
        .get(DataSource)
        .query('SELECT storage_key FROM documents WHERE id = $1', [
          res.body.id,
        ]);
      const storage = app.get(StorageService);
      await expect(storage.read(key)).resolves.toBeDefined();

      await request(app.getHttpServer())
        .delete(`/documents/${res.body.id}`)
        .set(auth(priya))
        .expect(204);
      await expect(storage.read(key)).rejects.toThrow();
    });

    it('rejects a file over the size limit', async () => {
      const big = Buffer.alloc(10 * 1024 * 1024 + 1, 'a');
      await upload(priya, big, 'big.txt').expect(413);
    });

    it('rejects a request with no file', async () => {
      await request(app.getHttpServer())
        .post('/documents/upload')
        .set(auth(priya))
        .expect(400);
    });

    it('removes directory parts from filenames', async () => {
      const res = await upload(
        priya,
        Buffer.from('hello'),
        '..\\..\\evil.txt',
      ).expect(202);
      expect(res.body.filename).toBe('evil.txt');
    });
  });

  describe('access control', () => {
    let privateId: string;
    let publicId: string;

    beforeAll(async () => {
      const own = await upload(priya, Buffer.from('salary 100'), 'offer.txt');
      privateId = own.body.id as string;

      const shared = await upload(priya, Buffer.from('dbms'), 'library.txt');
      publicId = shared.body.id as string;
      await app
        .get(DataSource)
        .query(`UPDATE documents SET visibility = 'public' WHERE id = $1`, [
          publicId,
        ]);
    });

    it('hides a private document from other users', async () => {
      const server = app.getHttpServer();
      await request(server)
        .get(`/documents/${privateId}`)
        .set(auth(rahul))
        .expect(404);
      await request(server)
        .get(`/documents/${privateId}/pages/1`)
        .set(auth(rahul))
        .expect(404);
      await request(server)
        .get(`/documents/${privateId}/pages`)
        .set(auth(rahul))
        .expect(404);
      await request(server)
        .delete(`/documents/${privateId}`)
        .set(auth(rahul))
        .expect(404);
    });

    it('lets others read a public document but not delete it', async () => {
      const server = app.getHttpServer();
      const res = await request(server)
        .get(`/documents/${publicId}`)
        .set(auth(rahul))
        .expect(200);
      expect(res.body.isOwner).toBe(false);

      await request(server)
        .delete(`/documents/${publicId}`)
        .set(auth(rahul))
        .expect(403);
    });

    it('lists own and public documents only', async () => {
      const res = await request(app.getHttpServer())
        .get('/documents')
        .set(auth(rahul))
        .expect(200);
      const ids = res.body.items.map((doc: { id: string }) => doc.id);
      expect(ids).toEqual([publicId]);
      expect(res.body.total).toBe(1);
    });

    it('rejects a malformed id and an excessive page size', async () => {
      const server = app.getHttpServer();
      await request(server)
        .get('/documents/not-a-uuid')
        .set(auth(priya))
        .expect(400);
      await request(server)
        .get('/documents?limit=1000')
        .set(auth(priya))
        .expect(400);
    });

    it('pages through results', async () => {
      const res = await request(app.getHttpServer())
        .get('/documents?limit=1&offset=1')
        .set(auth(priya))
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBeGreaterThan(1);
    });

    it('deletes the pages along with the document', async () => {
      const server = app.getHttpServer();
      await request(server)
        .delete(`/documents/${privateId}`)
        .set(auth(priya))
        .expect(204);
      await request(server)
        .get(`/documents/${privateId}`)
        .set(auth(priya))
        .expect(404);

      const rows = await app
        .get(DataSource)
        .query('SELECT 1 FROM document_pages WHERE document_id = $1', [
          privateId,
        ]);
      expect(rows).toHaveLength(0);
    });
  });
});
