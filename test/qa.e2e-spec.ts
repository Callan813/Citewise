import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  ChatProvider,
  ChatRateLimitError,
  type ChatRequest,
} from '../src/qa/chat.provider.js';
import { FakeChatProvider } from '../src/qa/fake-chat.provider.js';
import { NOT_FOUND_ANSWER } from '../src/qa/prompt.js';
import { createTestApp } from './utils/create-test-app.js';

// Records what the model was sent, and can be told what to do next.
class ScriptedChat extends FakeChatProvider {
  requests: ChatRequest[] = [];
  script: string[] | Error | null = null;

  override async *stream(req: ChatRequest): AsyncIterable<string> {
    this.requests.push(req);
    if (this.script instanceof Error) {
      yield 'partial ';
      throw this.script;
    }
    if (this.script) {
      yield* this.script;
      return;
    }
    yield* super.stream(req);
  }
}

describe('Ask (e2e)', () => {
  let app: INestApplication<App>;
  let priya: string;
  let rahul: string;
  const chat = new ScriptedChat();

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const register = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'long-enough-password' })
      .expect(201);
    return res.body.accessToken as string;
  };

  const upload = async (token: string, text: string, name: string) => {
    const res = await request(app.getHttpServer())
      .post('/documents/upload')
      .set(auth(token))
      .attach('file', Buffer.from(text), name)
      .expect(202);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const doc = await request(app.getHttpServer())
        .get(`/documents/${res.body.id}`)
        .set(auth(token));
      if (doc.body.status === 'ready') return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('document never became ready');
  };

  const ask = (token: string, question: string) =>
    request(app.getHttpServer())
      .post('/ask')
      .set(auth(token))
      .send({ question });

  const askStream = (token: string, question: string) =>
    request(app.getHttpServer())
      .post('/ask/stream')
      .set(auth(token))
      .send({ question })
      .buffer(true)
      .parse((res, callback) => {
        let text = '';
        res.on('data', (chunk: Buffer) => (text += chunk.toString()));
        res.on('end', () => callback(null, text));
      });

  const parseEvents = (body: string) =>
    body
      .trim()
      .split('\n\n')
      .map((block) => {
        const [event, data] = block.split('\n');
        return {
          event: event.replace('event: ', ''),
          data: JSON.parse(data.replace('data: ', '')) as Record<
            string,
            unknown
          >,
        };
      });

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ChatProvider).useValue(chat),
    );
    priya = await register('priya@example.com');
    rahul = await register('rahul@example.com');
    await upload(
      priya,
      'Normalization: second normal form removes partial dependencies.',
      'dbms.txt',
    );
    await upload(priya, 'Secret salary figure zebraquartz.', 'offer.txt');
  });

  beforeEach(() => {
    chat.requests = [];
    chat.script = null;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a login', async () => {
    await request(app.getHttpServer())
      .post('/ask')
      .send({ question: 'anything' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/ask/stream')
      .send({ question: 'anything' })
      .expect(401);
  });

  it('rejects empty and oversized questions', async () => {
    await ask(priya, '   ').expect(400);
    await ask(priya, 'x'.repeat(501)).expect(400);
  });

  it('answers with sources', async () => {
    const res = await ask(priya, 'second normal form').expect(200);

    expect(res.body.answer).toContain('[1]');
    expect(res.body.sources[0]).toMatchObject({
      number: 1,
      filename: 'dbms.txt',
      pageNumber: 1,
    });
    expect(chat.requests[0].system).toContain('only');
    expect(chat.requests[0].prompt).toContain('partial dependencies');
  });

  it('skips the model entirely when nothing is relevant', async () => {
    const res = await ask(priya, 'qwxzv jkqyp').expect(200);

    expect(res.body).toMatchObject({ answer: NOT_FOUND_ANSWER, sources: [] });
    expect(chat.requests).toHaveLength(0);
  });

  it("never sends another user's private text to the model", async () => {
    await ask(priya, 'salary zebraquartz').expect(200);
    expect(chat.requests.at(-1)?.prompt).toContain('zebraquartz');

    chat.requests = [];
    await ask(rahul, 'salary zebraquartz').expect(200);
    for (const req of chat.requests) {
      expect(req.prompt).not.toContain('zebraquartz');
    }
  });

  it('returns only the passages the answer cited', async () => {
    chat.script = ['Salary is in the offer [2].'];
    const res = await ask(
      priya,
      'second normal form salary zebraquartz',
    ).expect(200);

    expect(res.body.sources.map((s: { number: number }) => s.number)).toEqual([
      2,
    ]);
  });

  it('shows no sources when the model says it cannot answer', async () => {
    chat.script = [NOT_FOUND_ANSWER];
    const res = await ask(priya, 'second normal form').expect(200);
    expect(res.body.sources).toEqual([]);
  });

  it('reports rate limits as 503 with a safe message', async () => {
    chat.script = new ChatRateLimitError();
    const res = await ask(priya, 'second normal form').expect(503);
    expect(res.body.message).toContain('try again later');
  });

  it('does not expose provider error details', async () => {
    chat.script = new Error('secret-internal-detail');
    const res = await ask(priya, 'second normal form').expect(503);
    expect(JSON.stringify(res.body)).not.toContain('secret-internal-detail');
  });

  it('treats an empty answer as a failure', async () => {
    chat.script = ['   '];
    await ask(priya, 'second normal form').expect(503);
  });

  describe('streaming', () => {
    it('sends pieces of the answer, then the sources', async () => {
      chat.script = ['Second ', 'normal ', 'form [1].'];
      const res = await askStream(priya, 'second normal form').expect(200);

      expect(res.headers['content-type']).toContain('text/event-stream');
      const events = parseEvents(res.body as string);
      expect(events.slice(0, 3).map((e) => e.data.text)).toEqual([
        'Second ',
        'normal ',
        'form [1].',
      ]);
      const done = events.at(-1);
      expect(done?.event).toBe('done');
      expect(done?.data.mode).toBe('hybrid');
      expect(done?.data.sources).toHaveLength(1);
    });

    it('streams the fixed reply when nothing is relevant', async () => {
      const res = await askStream(priya, 'qwxzv jkqyp').expect(200);
      const events = parseEvents(res.body as string);
      expect(events[0].data.text).toBe(NOT_FOUND_ANSWER);
      expect(events.at(-1)?.data.sources).toEqual([]);
      expect(chat.requests).toHaveLength(0);
    });

    it('reports failures partway through as an event, safely', async () => {
      chat.script = new Error('secret-internal-detail');
      const res = await askStream(priya, 'second normal form').expect(200);
      const events = parseEvents(res.body as string);

      expect(events[0].data.text).toBe('partial ');
      expect(events.at(-1)?.event).toBe('error');
      expect(res.body as string).not.toContain('secret-internal-detail');
    });
  });
});
