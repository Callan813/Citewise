import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { User } from './user.entity.js';
import { UsersRepository } from './users.repository.js';

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async create(email: string, passwordHash: string): Promise<User> {
    try {
      return await this.users.create(normalizeEmail(email), passwordHash);
    } catch (err) {
      // Rely on the unique index rather than "check, then insert": two signups
      // with the same email at the same moment would both pass a check, but
      // only one can get past the index.
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw err;
    }
  }

  // Google has proven this person owns the email. Password signups aren't
  // verified, so an existing password might belong to someone who registered
  // with this email first, hoping the real owner would later link to it. Linking
  // removes that password, so only Google can open the account from then on.
  async findOrCreateFromGoogle(profile: {
    googleId: string;
    email: string;
  }): Promise<User> {
    const email = normalizeEmail(profile.email);

    const known = await this.users.findByGoogleId(profile.googleId);
    if (known) return known;

    const sameEmail = await this.users.findByEmail(email);
    if (sameEmail) {
      if (sameEmail.googleId) {
        throw new ConflictException(
          'This email is linked to a different Google account',
        );
      }
      await this.users.linkGoogle(sameEmail.id, profile.googleId);
      sameEmail.googleId = profile.googleId;
      return sameEmail;
    }

    try {
      return await this.users.create(email, null, profile.googleId);
    } catch (err) {
      // Two first-time sign-ins at once, such as a double click: use the winner.
      if (isUniqueViolation(err)) {
        const winner = await this.users.findByGoogleId(profile.googleId);
        if (winner) return winner;
      }
      throw err;
    }
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users.findByEmailWithPassword(normalizeEmail(email));
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
