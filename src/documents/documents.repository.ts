import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { PageText, TextChunk } from './chunker.js';
import { Chunk } from './entities/chunk.entity.js';
import { DocumentPage } from './entities/document-page.entity.js';
import {
  Document,
  DocumentStatus,
  DocumentVisibility,
} from './entities/document.entity.js';

@Injectable()
export class DocumentsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  create(fields: Partial<Document>): Promise<Document> {
    const repo = this.db.getRepository(Document);
    return repo.save(repo.create(fields));
  }

  // For the worker, which acts on behalf of no particular user. Anything
  // serving a user's request must use the visibleTo queries below instead.
  findById(id: string): Promise<Document | null> {
    return this.db.getRepository(Document).findOneBy({ id });
  }

  findPages(documentId: string): Promise<DocumentPage[]> {
    return this.db.getRepository(DocumentPage).find({
      where: { documentId },
      order: { pageNumber: 'ASC' },
    });
  }

  countChunks(documentId: string): Promise<number> {
    return this.db.getRepository(Chunk).countBy({ documentId });
  }

  // One transaction, so a crash can't leave pages without their chunks. The row
  // lock stops a delete from happening between the check and the inserts.
  saveExtraction(
    id: string,
    pages: PageText[],
    chunks: TextChunk[],
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      const document = await tx.findOne(Document, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (document?.status !== DocumentStatus.PROCESSING) return;

      await tx.delete(DocumentPage, { documentId: id });
      await tx.delete(Chunk, { documentId: id });
      await tx.insert(
        DocumentPage,
        pages.map((page) => ({
          documentId: id,
          pageNumber: page.pageNumber,
          content: page.content,
        })),
      );
      await tx.insert(
        Chunk,
        chunks.map((chunk) => ({ ...chunk, documentId: id })),
      );
    });
  }

  findUnembeddedChunks(documentId: string, limit: number): Promise<Chunk[]> {
    return this.db
      .getRepository(Chunk)
      .createQueryBuilder('chunk')
      .where('chunk.documentId = :documentId', { documentId })
      .andWhere('chunk.embedding IS NULL')
      .orderBy('chunk.chunkIndex', 'ASC')
      .take(limit)
      .getMany();
  }

  async saveEmbeddings(
    embeddings: { id: string; vector: number[] }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const { id, vector } of embeddings) {
        await tx.update(Chunk, id, { embedding: JSON.stringify(vector) });
      }
    });
  }

  // The last step, so a document never appears as ready and searchable while
  // its chunks are only partly embedded.
  async markReady(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const pageCount = await tx.countBy(DocumentPage, { documentId: id });
      await tx.update(
        Document,
        { id, status: DocumentStatus.PROCESSING },
        { status: DocumentStatus.READY, pageCount, error: null },
      );
    });
  }

  // For the reindex script.
  async markUnchunkedForProcessing(): Promise<string[]> {
    const [rows] = (await this.db.query(
      `UPDATE documents d SET status = 'processing'
       WHERE d.status = 'ready'
         AND NOT EXISTS (SELECT 1 FROM chunks c WHERE c.document_id = d.id)
       RETURNING d.id`,
    )) as [{ id: string }[], number];
    return rows.map((row) => row.id);
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db
      .getRepository(Document)
      .update(
        { id, status: DocumentStatus.PROCESSING },
        { status: DocumentStatus.FAILED, error },
      );
  }

  // The access rule lives in one query builder, so reads can't diverge.
  private visibleTo(userId: string) {
    return this.db
      .getRepository(Document)
      .createQueryBuilder('doc')
      .where('(doc.userId = :userId OR doc.visibility = :publicVisibility)', {
        userId,
        publicVisibility: DocumentVisibility.PUBLIC,
      });
  }

  listVisibleTo(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<[Document[], number]> {
    return this.visibleTo(userId)
      .orderBy('doc.uploadDate', 'DESC')
      .addOrderBy('doc.id', 'DESC') // keeps paging stable on identical times
      .take(limit)
      .skip(offset)
      .getManyAndCount();
  }

  findVisibleById(id: string, userId: string): Promise<Document | null> {
    return this.visibleTo(userId).andWhere('doc.id = :id', { id }).getOne();
  }

  async findPageNumbers(documentId: string): Promise<number[]> {
    const pages = await this.db.getRepository(DocumentPage).find({
      select: { pageNumber: true },
      where: { documentId },
      order: { pageNumber: 'ASC' },
    });
    return pages.map((page) => page.pageNumber);
  }

  findPage(
    documentId: string,
    pageNumber: number,
  ): Promise<DocumentPage | null> {
    return this.db
      .getRepository(DocumentPage)
      .findOneBy({ documentId, pageNumber });
  }

  // Returns whether a row was deleted, and its file so that can be removed too.
  // Pages are removed by ON DELETE CASCADE.
  async deleteOwned(
    id: string,
    userId: string,
  ): Promise<{ deleted: boolean; storageKey: string | null }> {
    const result = await this.db
      .createQueryBuilder()
      .delete()
      .from(Document)
      .where('id = :id AND user_id = :userId', { id, userId })
      .returning('storage_key')
      .execute();
    const rows = result.raw as { storage_key: string | null }[];
    return {
      deleted: rows.length > 0,
      storageKey: rows[0]?.storage_key ?? null,
    };
  }
}
