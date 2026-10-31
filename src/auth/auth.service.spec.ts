import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { GoogleTokenVerifier } from './google-token.verifier.js';

// A unit test: AuthService alone, with its dependencies replaced by fakes.
// This is where dependency injection pays off - no database, no HTTP.
describe('AuthService', () => {
  let service: AuthService;
  const users = { findByEmailWithPassword: vi.fn(), create: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        {
          provide: JwtService,
          useValue: { signAsync: vi.fn().mockResolvedValue('signed.jwt') },
        },
        { provide: ConfigService, useValue: { get: () => '1h' } },
        { provide: GoogleTokenVerifier, useValue: { verify: vi.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('still runs a password check when the email does not exist', async () => {
    users.findByEmailWithPassword.mockResolvedValue(null);
    const verify = vi.spyOn(argon2, 'verify');

    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // This is the timing-attack protection: unknown emails cost as much as
    // wrong passwords.
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('issues a token for a correct password', async () => {
    const passwordHash = await argon2.hash('right-password');
    users.findByEmailWithPassword.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      passwordHash,
      createdAt: new Date(),
    });

    const res = await service.login({
      email: 'a@b.com',
      password: 'right-password',
    });
    expect(res.accessToken).toBe('signed.jwt');
    expect(res.user).not.toHaveProperty('passwordHash');
  });
});
