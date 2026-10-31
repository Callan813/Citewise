import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { GoogleTokenVerifier } from '../src/auth/google-token.verifier.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const creds = {
    email: 'Priya@Example.com',
    password: 'correct-horse-battery',
  };

  beforeAll(async () => {
    // These tests can't call Google, so a fake reads the profile from the token.
    // Real token checks are covered in google-token.verifier.spec.ts.
    app = await createTestApp((builder) =>
      builder.overrideProvider(GoogleTokenVerifier).useValue({
        verify: (idToken: string) => {
          if (idToken === 'bad') throw new UnauthorizedException();
          return JSON.parse(idToken) as object;
        },
      }),
    );
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

  describe('Google sign-in', () => {
    const google = (googleId: string, email: string) =>
      request(app.getHttpServer())
        .post('/auth/google')
        .send({ idToken: JSON.stringify({ googleId, email }) });
    const passwordHash = async (email: string): Promise<string | null> => {
      const [row] = await app
        .get(DataSource)
        .query('SELECT password_hash FROM users WHERE email = $1', [email]);
      return row.password_hash as string | null;
    };

    it('tells the frontend the client ID', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/config')
        .expect(200);
      expect(res.body).toEqual({ googleClientId: 'test-client-id' });
    });

    it('creates an account, and returns the same one next time', async () => {
      const first = await google('g-1', 'New.User@Example.com').expect(200);
      const second = await google('g-1', 'new.user@example.com').expect(200);

      expect(first.body.user.email).toBe('new.user@example.com');
      expect(second.body.user.id).toBe(first.body.user.id);
      expect(first.body.user).not.toHaveProperty('googleId');
      expect(await passwordHash('new.user@example.com')).toBeNull();

      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${first.body.accessToken}`)
        .expect(200);
    });

    it('rejects an invalid token, with no account created', async () => {
      await request(app.getHttpServer())
        .post('/auth/google')
        .send({ idToken: 'bad' })
        .expect(401);
    });

    it('does not let a Google-only account log in with a password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'new.user@example.com', password: 'any-password-here' })
        .expect(401);
    });

    it('blocks a password signup using a Google account email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'new.user@example.com', password: 'long-enough-pw' })
        .expect(409);
    });

    it('links an existing account and removes its unverified password', async () => {
      const email = 'target@example.com';
      const password = 'set-by-whoever-registered-first';
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const linked = await google('g-target', email).expect(200);
      expect(linked.body.user.id).toBe(registered.body.user.id);
      expect(await passwordHash(email)).toBeNull();

      // Whoever set that password can no longer get in.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(401);
    });

    it('refuses a second Google account for the same email', async () => {
      await google('g-other', 'target@example.com').expect(409);
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
