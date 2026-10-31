import { basename } from 'node:path';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { DocumentsRepository } from './documents.repository.js';
import type { DocumentPage } from './entities/document-page.entity.js';
import {
  type Document,
  DocumentStatus,
  DocumentVisibility,
} from './entities/document.entity.js';
import { TextExtractorService } from './text-extractor.service.js';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documents: DocumentsRepository,
    private readonly extractor: TextExtractorService,
  ) {}

  async upload(
    userId: string,
    file: { originalname: string; buffer: Buffer },
  ): Promise<Document> {
    const type = this.extractor.detectType(file.buffer);
    if (!type) {
      throw new UnsupportedMediaTypeException(
        'Only PDF and UTF-8 text files are supported',
      );
    }

    const pages = await this.extractor.extract(file.buffer, type);
    return this.documents.createWithPages(
      {
        userId,
        filename: this.cleanFilename(file.originalname),
        mimeType: type,
        sizeBytes: file.buffer.length,
        pageCount: pages.length,
        status: DocumentStatus.READY,
        // Uploads are always private. Only seeding creates public documents.
        visibility: DocumentVisibility.PRIVATE,
      },
      pages,
    );
  }

  list(userId: string, limit: number, offset: number) {
    return this.documents.listVisibleTo(userId, limit, offset);
  }

  // Someone else's private document gets a 404, not a 403: a 403 would confirm
  // that the id exists.
  async getVisible(id: string, userId: string): Promise<Document> {
    const document = await this.documents.findVisibleById(id, userId);
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async getPageNumbers(id: string, userId: string): Promise<number[]> {
    await this.getVisible(id, userId);
    return this.documents.findPageNumbers(id);
  }

  async getPage(
    id: string,
    pageNumber: number,
    userId: string,
  ): Promise<DocumentPage> {
    await this.getVisible(id, userId);
    const page = await this.documents.findPage(id, pageNumber);
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async delete(id: string, userId: string): Promise<void> {
    if (await this.documents.deleteOwned(id, userId)) return;

    // Nothing deleted: it's either hidden from them (404) or public but owned
    // by someone else (403).
    await this.getVisible(id, userId);
    throw new ForbiddenException('You can only delete your own documents');
  }

  private cleanFilename(name: string): string {
    // Treat backslashes as separators too, then drop any directory part.
    const clean = basename(name.replaceAll('\\', '/')).trim();
    return (clean || 'untitled').slice(0, 255);
  }
}
