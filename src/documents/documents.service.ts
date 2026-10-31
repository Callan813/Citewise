import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { UsageService } from '../usage/usage.service.js';
import { IngestionQueueService } from '../ingestion/ingestion-queue.service.js';
import { StorageService } from '../storage/storage.service.js';
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
    private readonly storage: StorageService,
    private readonly queue: IngestionQueueService,
    private readonly usage: UsageService,
    private readonly config: ConfigService<AppConfig, true>,
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

    const { maxDocuments } = this.config.get('limits', { infer: true });
    if ((await this.documents.countOwned(userId)) >= maxDocuments) {
      throw new ForbiddenException(
        `You can keep up to ${maxDocuments} documents. Delete one to add another.`,
      );
    }
    await this.usage.consumeUpload(userId);

    // File first, then row, then job. A failure at any step leaves nothing that
    // a later step depends on, and the catch below removes what was created.
    const storageKey = randomUUID();
    await this.storage.save(storageKey, file.buffer);

    let document: Document | undefined;
    try {
      document = await this.documents.create({
        userId,
        filename: this.cleanFilename(file.originalname),
        mimeType: type,
        sizeBytes: file.buffer.length,
        storageKey,
        status: DocumentStatus.PROCESSING,
        // Uploads are always private. Only seeding creates public documents.
        visibility: DocumentVisibility.PRIVATE,
      });
      await this.queue.enqueue(document.id);
      return document;
    } catch (err) {
      if (document) await this.documents.deleteOwned(document.id, userId);
      await this.storage.delete(storageKey);
      throw err;
    }
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
    const { deleted, storageKey } = await this.documents.deleteOwned(
      id,
      userId,
    );
    if (deleted) {
      if (storageKey) await this.storage.delete(storageKey);
      return;
    }

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
