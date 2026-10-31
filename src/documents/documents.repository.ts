import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DocumentPage } from './entities/document-page.entity.js';
import {
  Document,
  DocumentStatus,
  DocumentVisibility,
} from './entities/document.entity.js';
import type { ExtractedPage } from './text-extractor.service.js';

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

  // One transaction: pages and status change together or not at all. The row
  // lock stops a delete from happening between the check and the insert.
  completeIngestion(id: string, pages: ExtractedPage[]): Promise<void> {
    return this.db.transaction(async (tx) => {
      const document = await tx.findOne(Document, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (document?.status !== DocumentStatus.PROCESSING) return;

      await tx.delete(DocumentPage, { documentId: id });
      await tx.insert(
        DocumentPage,
        pages.map((page) => ({ ...page, documentId: id })),
      );
      await tx.update(Document, id, {
        status: DocumentStatus.READY,
        pageCount: pages.length,
        error: null,
      });
    });
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
