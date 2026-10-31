import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EMBEDDING_DIMENSIONS } from '../../embeddings/embedding.provider.js';
import { Document } from './document.entity.js';

@Entity('chunks')
@Index('uq_chunks_document_index', ['documentId', 'chunkIndex'], {
  unique: true,
})
export class Chunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document?: Document;

  @Column({ name: 'chunk_index', type: 'integer' })
  chunkIndex: number;

  @Column({ name: 'page_number', type: 'integer' })
  pageNumber: number;

  @Column({ type: 'text' })
  content: string;

  // Null until embedded, so a retried job can pick up where it stopped instead
  // of paying for the same chunks again.
  // HNSW makes nearest-neighbour search fast. TypeORM can't express its options,
  // so the index is written by hand in the migration.
  @Index('idx_chunks_embedding', { synchronize: false })
  @Column({
    type: 'vector',
    length: EMBEDDING_DIMENSIONS,
    nullable: true,
    select: false,
  })
  embedding: string | null;
}
