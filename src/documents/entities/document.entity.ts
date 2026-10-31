import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity.js';

export enum DocumentStatus {
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export enum DocumentVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

// Plain varchar with a CHECK instead of a Postgres enum type: changing the
// allowed values later only means replacing the constraint.
@Entity('documents')
@Check('chk_documents_status', `status IN ('processing', 'ready', 'failed')`)
@Check('chk_documents_visibility', `visibility IN ('private', 'public')`)
@Index('idx_documents_user_upload', ['userId', 'uploadDate'])
@Index('idx_documents_visibility', ['visibility'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // Deleting a user deletes their documents, enforced by the database itself.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes: number;

  @Column({ name: 'page_count', type: 'integer', default: 0 })
  pageCount: number;

  // Where the original file is. Null for documents from before files were kept.
  @Column({ name: 'storage_key', type: 'varchar', length: 255, nullable: true })
  storageKey: string | null;

  @Column({ type: 'varchar', length: 20, default: DocumentStatus.PROCESSING })
  status: DocumentStatus;

  // Why processing failed, in words that are safe to show the user.
  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'varchar', length: 20, default: DocumentVisibility.PRIVATE })
  visibility: DocumentVisibility;

  @CreateDateColumn({ name: 'upload_date', type: 'timestamptz' })
  uploadDate: Date;
}
