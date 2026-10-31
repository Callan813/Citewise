import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User {
  // UUIDs instead of 1, 2, 3...: ids show up in URLs, and sequential ones leak
  // how many users you have and invite guessing other people's ids.
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Stored lowercased by UsersService, so the unique index is effectively
  // case-insensitive.
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  // select: false means normal queries never load the hash. Code that needs it
  // (login) has to ask for it explicitly, so it can't leak into a response.
  // Null for accounts that only sign in with Google.
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
    nullable: true,
  })
  passwordHash: string | null;

  // Google's permanent id for this person. Emails can change, this can't.
  @Index('uq_users_google_id', { unique: true })
  @Column({ name: 'google_id', type: 'varchar', length: 255, nullable: true })
  googleId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
