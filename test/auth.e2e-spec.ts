import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const creds = {
    email: 'Priya@Example.com',
    password: 'correct-horse-battery',
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates the user and returns a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(creds)
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.user.email).toBe('priya@example.com'); // normalised
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('stores a hash, never the password', async () => {
      const [row] = await app
        .get(DataSource)
        .query('SELECT password_hash FROM users WHERE email = $1', [
          'priya@example.com',
        ]);
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.password_hash).not.toContain(creds.password);
    });

    it('rejects a duplicate email regardless of case', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...creds, email: 'PRIYA@example.com' })
        .expect(409);
    });

    it('rejects invalid input with every problem listed', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
      expect(res.body.message).toHaveLength(2);
    });

    it('rejects fields that are not in the DTO', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'new@example.com',
          password: 'long-enough-pw',
          isAdmin: true,
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('returns a token for correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send(creds)
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...creds, password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever-pw' })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('GET /users/me', () => {
    it('works with a valid token', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send(creds);

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(res.body.email).toBe('priya@example.com');
    });

    it('rejects a missing token', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('rejects a tampered token', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send(creds);
      const tampered = login.body.accessToken.slice(0, -2) + 'xx';

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
    });
  });
});
