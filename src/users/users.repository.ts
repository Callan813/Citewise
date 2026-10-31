import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

// The only place that talks to the users table. Services ask for what they
// need ("find by email") and never build queries themselves, so swapping the
// ORM or tuning a query touches this one file.
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOneBy({ id });
  }

  // The one query that loads the password hash, because login needs it.
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.repo.findOneBy({ googleId });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOneBy({ email });
  }

  // Removing the password is deliberate: see UsersService.findOrCreateFromGoogle.
  async linkGoogle(id: string, googleId: string): Promise<void> {
    await this.repo.update(id, { googleId, passwordHash: null });
  }

  async create(
    email: string,
    passwordHash: string | null,
    googleId: string | null = null,
  ): Promise<User> {
    const saved = await this.repo.save(
      this.repo.create({ email, passwordHash, googleId }),
    );
    // Don't hand the hash back to callers, even right after creating it.
    const { passwordHash: _omit, ...user } = saved;
    return user as User;
  }
}
