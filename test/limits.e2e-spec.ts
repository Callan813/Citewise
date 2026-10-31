import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { ChatProvider, type ChatRequest } from '../src/qa/chat.provider.js';
import { FakeChatProvider } from '../src/qa/fake-chat.provider.js';
import { createTestApp } from './utils/create-test-app.js';

// Config is read once at import, so these have to be set before anything loads.
vi.hoisted(() => {
  process.env.RATE_LIMIT_MULTIPLIER = '1';
  process.env.TRUST_PROXY_HOPS = '1'; // lets tests act as different IP addresses
  process.env.DAILY_QUESTION_LIMIT = '3';
  process.env.DAILY_QUESTION_LIMIT_GLOBAL = '6';
  process.env.DAILY_UPLOAD_LIMIT = '5';
  process.env.MAX_DOCUMENTS_PER_USER = '4';
  process.env.METRICS_TOKEN = 'test-metrics-token';
});

class CountingChat extends FakeChatProvider {
  calls = 0;

  override async *stream(req: ChatRequest): AsyncIterable<string> {
    this.calls += 1;
    req.onUsage?.({ inputTokens: 100, outputTokens: 20 });
    yield* super.stream(req);
  }
}

describe('Limits (e2e)', () => {
  let app: INestApplication<App>;
  const chat = new CountingChat();

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const register = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('X-Forwarded-For', `10.0.0.${email.length}`)
      .send({ email, password: 'long-enough-password' })
      .expect(201);
    return res.body.accessToken as string;
  };

  const upload = async (token: string, text: string, name: string) => {
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set(auth(token))
      .attach('file', Buffer.from(text), name);
    if (res.status !== 202) return res;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const doc = await request(app.getHttpServer())
        .get(`/documents/${res.body.id}`)
        .set(auth(token));
      if (doc.body.status !== 'processing') return res;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('document never finished');
  };

  const ask = (token: string, question: string) =>
    request(app.getHttpServer())
      .post('/ask')
      .set(auth(token))
      .send({ question });

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ChatProvider).useValue(chat),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rate limits by route and reports when to retry', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever-password' });

    for (let i = 0; i < 10; i += 1) await attempt().expect(401);
    const blocked = await attempt().expect(429);

    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.statusCode).toBe(429);

    // Other routes have their own counters.
    await request(app.getHttpServer()).get('/auth/config').expect(200);
  });

  describe('answer cache', () => {
    let token: string;

    beforeAll(async () => {
      await request(app.getHttpServer()).get('/health');
      token = await register('cache@example.com');
      await upload(token, 'Mitochondria produce energy in cells.', 'bio.txt');
      chat.calls = 0;
    });

    it('answers a repeated question without the model or quota', async () => {
      const first = await ask(token, 'mitochondria energy').expect(200);
      expect(first.body.cached).toBe(false);
      expect(chat.calls).toBe(1);

      // Different case and punctuation are still the same question.
      const second = await ask(token, 'Mitochondria, ENERGY?').expect(200);
      expect(second.body.cached).toBe(true);
      expect(second.body.answer).toBe(first.body.answer);
      expect(second.body.sources).toEqual(first.body.sources);
      expect(chat.calls).toBe(1);

      const usage = await request(app.getHttpServer())
        .get('/users/me/usage')
        .set(auth(token))
        .expect(200);
      expect(usage.body).toMatchObject({
        questionsUsed: 1,
        questionsLimit: 3,
        inputTokens: 100,
        outputTokens: 20,
      });
    });

    it('never shares answers between users', async () => {
      const other = await register('cache-other@example.com');
      const res = await ask(other, 'mitochondria energy').expect(200);
      expect(res.body.cached).toBe(false);
      expect(res.body.sources).toEqual([]);
    });

    it('stops using old answers when the documents change', async () => {
      await upload(token, 'Unrelated ribosome notes.', 'more.txt');
      const res = await ask(token, 'mitochondria energy').expect(200);
      expect(res.body.cached).toBe(false);
    });

    it('streams cached answers too', async () => {
      const res = await request(app.getHttpServer())
        .post('/ask/stream')
        .set(auth(token))
        .send({ question: 'mitochondria energy' })
        .buffer(true)
        .parse((response, callback) => {
          let text = '';
          response.on('data', (chunk: Buffer) => (text += chunk.toString()));
          response.on('end', () => callback(null, text));
        })
        .expect(200);
      expect(res.body as string).toContain('"cached":true');
    });
  });

  describe('quotas', () => {
    it('stops a user at their daily question limit', async () => {
      const token = await register('quota-user@example.com');
      await upload(token, 'Alpha beta gamma delta epsilon.', 'greek.txt');
      chat.calls = 0;

      await ask(token, 'alpha').expect(200);
      await ask(token, 'beta').expect(200);
      await ask(token, 'gamma').expect(200);
      const blocked = await ask(token, 'delta').expect(429);

      expect(blocked.body.message).toContain('3');
      expect(chat.calls).toBe(3);

      // Repeats and unanswerable questions cost nothing, so they still work.
      const repeat = await ask(token, 'alpha').expect(200);
      expect(repeat.body.cached).toBe(true);
      await ask(token, 'qwxzv jkqyp').expect(200);
    });

    it('stops everyone at the whole-app limit', async () => {
      const token = await register('quota-late-user@example.com');
      await upload(token, 'Omega psi chi phi upsilon.', 'greek2.txt');

      const first = await ask(token, 'omega');
      const second = await ask(token, 'psi');
      const statuses = [first.status, second.status];
      expect(statuses).toContain(429);
      const blocked = first.status === 429 ? first : second;
      expect(blocked.body.message).toContain('demo');
    });

    it('limits documents per user', async () => {
      const token = await register('docs-limit@example.com');
      for (let i = 0; i < 4; i += 1) {
        const res = await upload(token, `Document ${i}`, `d${i}.txt`);
        expect(res.status).toBe(202);
      }
      const blocked = await upload(token, 'One more', 'extra.txt');
      expect(blocked.status).toBe(403);
    });
  });

  describe('metrics', () => {
    it('hides behind a token', async () => {
      await request(app.getHttpServer()).get('/metrics').expect(404);
      await request(app.getHttpServer())
        .get('/metrics')
        .set('Authorization', 'Bearer wrong')
        .expect(404);
    });

    it('reports route patterns rather than raw URLs', async () => {
      const token = await register('metrics-reader@example.com');
      await request(app.getHttpServer())
        .get('/documents/00000000-0000-4000-8000-000000000000')
        .set(auth(token))
        .expect(404);

      const res = await request(app.getHttpServer())
        .get('/metrics')
        .set('Authorization', 'Bearer test-metrics-token')
        .expect(200);

      expect(res.text).toContain('route="/documents/:id"');
      expect(res.text).not.toContain('00000000-0000-4000');
      expect(res.text).toContain('qa_answers_total{source="cache_exact"}');
      expect(res.text).toContain('rate_limited_requests_total{rule="login"}');
      expect(res.text).toContain('ingestion_queue_jobs');
    });
  });
});
