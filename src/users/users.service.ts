import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { User } from './user.entity.js';
import { UsersRepository } from './users.repository.js';

const PG_UNIQUE_VIOLATION = '23505';

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
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
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
