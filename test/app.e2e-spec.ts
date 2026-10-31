import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './utils/create-test-app.js';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public and reports the database up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.database.status).toBe('up');
  });

  it('unknown routes return 404', async () => {
    // Guards only run for routes that exist; an unmatched URL never enters
    // Nest's request pipeline, so this is a 404 rather than a 401.
    await request(app.getHttpServer()).get('/does-not-exist').expect(404);
  });

  it('errors use the standard shape', async () => {
    const res = await request(app.getHttpServer()).get('/users/me').expect(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      path: '/users/me',
    });
    expect(res.body.timestamp).toBeDefined();
  });
});
