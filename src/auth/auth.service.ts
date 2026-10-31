import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { AppConfig } from '../config/configuration.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type { AuthConfigResponseDto } from './dto/auth-config-response.dto.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { GoogleTokenVerifier } from './google-token.verifier.js';
import type { JwtPayload } from './jwt-payload.interface.js';

@Injectable()
export class AuthService {
  // A real argon2 hash of a random string, computed once. Used to keep login
  // equally slow whether or not the email exists (see login()).
  private readonly dummyHash = argon2.hash(crypto.randomUUID());

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly googleVerifier: GoogleTokenVerifier,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // argon2id: deliberately slow and memory-hungry, so an attacker who steals
    // the database can only try a handful of guesses per second per hash.
    // It also salts automatically - the salt is stored inside the hash string.
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create(dto.email, passwordHash);
    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);

    // Always run a hash check, even for unknown emails. Otherwise "no such user"
    // answers in 2ms and "wrong password" in 50ms, and an attacker can time the
    // responses to find out which emails have accounts.
    // Google-only accounts have no password, so they take this path too.
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const passwordOk = await argon2.verify(hash, dto.password);

    if (!user?.passwordHash || !passwordOk) {
      // Same message for both cases, for the same reason.
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueToken(user);
  }

  // After this, a Google user holds the same kind of token as anyone else, so
  // the rest of the app doesn't need to know how they signed in.
  async loginWithGoogle(idToken: string): Promise<AuthResponseDto> {
    if (!this.googleClientId()) {
      throw new ServiceUnavailableException('Google sign-in is not set up');
    }
    const profile = await this.googleVerifier.verify(idToken);
    const user = await this.users.findOrCreateFromGoogle(profile);
    return this.issueToken(user);
  }

  getConfig(): AuthConfigResponseDto {
    return { googleClientId: this.googleClientId() || null };
  }

  private googleClientId(): string {
    return this.config.get('google', { infer: true }).clientId;
  }

  private async issueToken(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.get('jwt.expiresIn', { infer: true }),
      user: UserResponseDto.from(user),
    };
  }
}
