import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DocumentPage } from './entities/document-page.entity.js';
import { Document, DocumentVisibility } from './entities/document.entity.js';
import type { ExtractedPage } from './text-extractor.service.js';

@Injectable()
export class DocumentsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // One transaction: a failure can't leave a document without its pages.
  createWithPages(
    fields: Partial<Document>,
    pages: ExtractedPage[],
  ): Promise<Document> {
    return this.db.transaction(async (tx) => {
      const document = await tx.save(Document, tx.create(Document, fields));
      await tx.insert(
        DocumentPage,
        pages.map((page) => ({ ...page, documentId: document.id })),
      );
      return document;
    });
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

  // Pages are removed by ON DELETE CASCADE.
  async deleteOwned(id: string, userId: string): Promise<boolean> {
    const result = await this.db.getRepository(Document).delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }
}
