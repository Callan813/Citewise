import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Document } from './document.entity.js';

// Text is kept per page so that answers can later cite "page 14".
@Entity('document_pages')
export class DocumentPage {
  // This composite key also indexes document_id for lookups and cascades.
  @PrimaryColumn({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @PrimaryColumn({ name: 'page_number', type: 'integer' })
  pageNumber: number;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document?: Document;

  @Column({ type: 'text' })
  content: string;
}
