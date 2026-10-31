import { createSign, generateKeyPairSync } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { AppConfig } from '../config/configuration.js';
import { GoogleAuthLibraryVerifier } from './google-token.verifier.js';

// Runs the real verification code against a key pair made here, standing in for
// Google's published keys. Only the download of those keys is replaced.
const google = generateKeyPairSync('rsa', { modulusLength: 2048 });
const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CLIENT_ID = 'citewise-client-id';

const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

function makeToken(
  claims: Record<string, unknown> = {},
  key = google.privateKey,
): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })}.${encode(
    {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'google-user-1',
      email: 'priya@example.com',
      email_verified: true,
      iat: now,
      exp: now + 3600,
      ...claims,
    },
  )}`;
  const signature = createSign('RSA-SHA256')
    .update(body)
    .sign(key, 'base64url');
  return `${body}.${signature}`;
}

describe('GoogleAuthLibraryVerifier', () => {
  const config = {
    get: () => ({ clientId: CLIENT_ID }),
  } as unknown as ConfigService<AppConfig, true>;
  const verifier = new GoogleAuthLibraryVerifier(config);

  beforeEach(() => {
    vi.spyOn(
      OAuth2Client.prototype,
      'getFederatedSignonCertsAsync',
    ).mockResolvedValue({
      certs: {
        'test-key': google.publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      },
      format: 'PEM' as never, // the enum isn't exported by the package
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid token and returns the profile', async () => {
    await expect(verifier.verify(makeToken())).resolves.toEqual({
      googleId: 'google-user-1',
      email: 'priya@example.com',
    });
  });

  it.each([
    ['signed with the wrong key', makeToken({}, attacker.privateKey)],
    ['issued for another website', makeToken({ aud: 'some-other-site' })],
    ['issued by someone else', makeToken({ iss: 'https://evil.example.com' })],
    ['expired', makeToken({ exp: Math.floor(Date.now() / 1000) - 7200 })],
    ['for an unverified email', makeToken({ email_verified: false })],
    ['missing an email', makeToken({ email: undefined })],
    ['not a token at all', 'garbage'],
  ])('rejects a token that is %s', async (_name, token) => {
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
