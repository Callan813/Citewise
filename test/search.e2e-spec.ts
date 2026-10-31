import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { DocumentsRepository } from '../src/documents/documents.repository.js';
import {
  EmbeddingProvider,
  EmbeddingRateLimitError,
} from '../src/embeddings/embedding.provider.js';
import { FakeEmbeddingProvider } from '../src/embeddings/fake-embedding.provider.js';
import { IngestionQueueService } from '../src/ingestion/ingestion-queue.service.js';
import { createTestApp } from './utils/create-test-app.js';

// Real fake embeddings, plus switches that make the provider misbehave on demand.
class ControllableProvider extends FakeEmbeddingProvider {
  rateLimitsLeft = 0;
  queriesDown = false;
  documentCalls = 0;

  override embedDocuments(texts: string[]) {
    this.documentCalls += 1;
    if (this.rateLimitsLeft > 0) {
      this.rateLimitsLeft -= 1;
      throw new EmbeddingRateLimitError(100);
    }
    return super.embedDocuments(texts);
  }

  override embedQuery(text: string) {
    if (this.queriesDown) throw new Error('provider down');
    return super.embedQuery(text);
  }
}

describe('Search (e2e)', () => {
  let app: INestApplication<App>;
  let priya: string;
  let rahul: string;
  const provider = new ControllableProvider();

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const register = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'long-enough-password' })
      .expect(201);
    return res.body.accessToken as string;
  };

  const waitForDocument = async (token: string, id: string) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get(`/documents/${id}`)
        .set(auth(token));
      if (res.body.status !== 'processing') return res.body;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Document ${id} was still processing`);
  };

  const uploadReady = async (token: string, text: string, name: string) => {
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set(auth(token))
      .attach('file', Buffer.from(text), name)
      .expect(202);
    const done = await waitForDocument(token, res.body.id);
    expect(done.status).toBe('ready');
    return res.body.id as string;
  };

  const search = (token: string, query: string, limit?: number) =>
    request(app.getHttpServer())
      .post('/search')
      .set(auth(token))
      .send({ query, limit });

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(EmbeddingProvider).useValue(provider),
    );
    priya = await register('priya@example.com');
    rahul = await register('rahul@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a login', async () => {
    await request(app.getHttpServer())
      .post('/search')
      .send({ query: 'anything' })
      .expect(401);
  });

  it('rejects empty and oversized queries', async () => {
    await search(priya, '   ').expect(400);
    await search(priya, 'x'.repeat(501)).expect(400);
    await search(priya, 'valid', 100).expect(400);
  });

  it('finds a passage and reports its file and page', async () => {
    const page2 = `${'filler words here. '.repeat(160)}Boyce Codd normal form tightens third normal form.`;
    await uploadReady(priya, page2, 'normal-forms.txt');

    const res = await search(priya, 'Boyce Codd normal form').expect(200);

    expect(res.body.mode).toBe('hybrid');
    expect(res.body.results[0]).toMatchObject({
      filename: 'normal-forms.txt',
      pageNumber: 2,
    });
    expect(res.body.results[0].content).toContain('Boyce Codd');
    expect(res.body.results[0]).not.toHaveProperty('embedding');
  });

  it('finds exact terms through keyword search alone', async () => {
    await uploadReady(priya, 'Port 8443 is used by XJ9Q gateways.', 'net.txt');
    provider.queriesDown = true;
    try {
      const res = await search(priya, 'XJ9Q').expect(200);
      expect(res.body.mode).toBe('keyword');
      expect(res.body.results[0].filename).toBe('net.txt');
    } finally {
      provider.queriesDown = false;
    }
  });

  it("never returns another user's private text", async () => {
    await uploadReady(priya, 'Secret salary figure zebraquartz.', 'offer.txt');

    const own = await search(priya, 'salary zebraquartz').expect(200);
    expect(own.body.results[0].filename).toBe('offer.txt');

    for (const down of [false, true]) {
      provider.queriesDown = down;
      const res = await search(rahul, 'salary zebraquartz').expect(200);
      const names = res.body.results.map(
        (r: { filename: string }) => r.filename,
      );
      expect(names).not.toContain('offer.txt');
    }
    provider.queriesDown = false;
  });

  it('includes public documents for everyone', async () => {
    const id = await uploadReady(priya, 'Public kumquat notes.', 'public.txt');
    await app
      .get(DataSource)
      .query(`UPDATE documents SET visibility = 'public' WHERE id = $1`, [id]);

    const res = await search(rahul, 'kumquat').expect(200);
    expect(res.body.results[0].filename).toBe('public.txt');
  });

  it('removes chunks from search when a document is deleted', async () => {
    const id = await uploadReady(priya, 'Temporary pomelo text.', 'temp.txt');
    await request(app.getHttpServer())
      .delete(`/documents/${id}`)
      .set(auth(priya))
      .expect(204);

    const res = await search(priya, 'pomelo').expect(200);
    const names = res.body.results.map((r: { filename: string }) => r.filename);
    expect(names).not.toContain('temp.txt');
  });

  it('waits out rate limits without using up retries', async () => {
    provider.rateLimitsLeft = 5; // more than the job's 3 attempts
    const id = await uploadReady(priya, 'Patient lychee text.', 'slow.txt');
    expect(provider.rateLimitsLeft).toBe(0);

    const [{ count }] = await app
      .get(DataSource)
      .query(
        'SELECT count(*)::int AS count FROM chunks WHERE document_id = $1 AND embedding IS NOT NULL',
        [id],
      );
    expect(count).toBe(1);
  }, 20_000);

  it('indexes older documents that have pages but no chunks', async () => {
    const id = await uploadReady(priya, 'Old durian notes.', 'old.txt');
    const db = app.get(DataSource);
    await db.query('DELETE FROM chunks WHERE document_id = $1', [id]);
    // Stands in for a document stored before files were kept.
    await db.query('UPDATE documents SET storage_key = NULL WHERE id = $1', [
      id,
    ]);

    const names = (res: request.Response) =>
      res.body.results.map((r: { filename: string }) => r.filename);
    const before = await search(priya, 'durian').expect(200);
    expect(names(before)).not.toContain('old.txt');

    const queue = app.get(IngestionQueueService);
    const ids = await app.get(DocumentsRepository).markUnchunkedForProcessing();
    expect(ids).toContain(id);
    for (const queued of ids) await queue.enqueue(queued);
    await waitForDocument(priya, id);

    const after = await search(priya, 'durian').expect(200);
    expect(after.body.results[0].filename).toBe('old.txt');
  });
});
