import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

export const MAX_PAGES = 500;
// Text files have no real pages, so they're split into page-sized pieces.
const TEXT_PAGE_CHARS = 3000;

export type SupportedMimeType = 'application/pdf' | 'text/plain';

export interface ExtractedPage {
  pageNumber: number;
  content: string;
}

@Injectable()
export class TextExtractorService {
  // Checks the actual bytes. The extension and Content-Type come from the
  // client, so a renamed .exe could claim to be anything.
  detectType(file: Buffer): SupportedMimeType | null {
    if (file.subarray(0, 5).toString('latin1') === '%PDF-') {
      return 'application/pdf';
    }
    return this.decodeText(file) === null ? null : 'text/plain';
  }

  async extract(
    file: Buffer,
    type: SupportedMimeType,
  ): Promise<ExtractedPage[]> {
    const pages =
      type === 'application/pdf'
        ? await this.extractPdf(file)
        : this.splitText(this.decodeText(file) ?? '');

    // Postgres text columns reject NUL bytes, which some PDFs contain.
    const cleaned = pages
      .map((page) => ({
        pageNumber: page.pageNumber,
        content: page.content.replaceAll('\0', '').trim(),
      }))
      .filter((page) => page.content.length > 0);

    if (cleaned.length === 0) {
      throw new UnprocessableEntityException(
        'No readable text found. Scanned or image-only files are not supported.',
      );
    }
    if (cleaned.length > MAX_PAGES) {
      throw new UnprocessableEntityException(
        `Documents can have at most ${MAX_PAGES} pages`,
      );
    }
    return cleaned;
  }

  private async extractPdf(file: Buffer): Promise<ExtractedPage[]> {
    const parser = new PDFParse({ data: file });
    try {
      const result = await parser.getText();
      return result.pages.map((page) => ({
        pageNumber: page.num,
        content: page.text,
      }));
    } catch {
      throw new UnprocessableEntityException(
        'This PDF could not be read. It may be corrupt or password-protected.',
      );
    } finally {
      await parser.destroy();
    }
  }

  private decodeText(file: Buffer): string | null {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(file);
      // Binary files can happen to be valid UTF-8, but rarely avoid NUL bytes.
      return text.includes('\0') ? null : text;
    } catch {
      return null;
    }
  }

  private splitText(text: string): ExtractedPage[] {
    const pages: ExtractedPage[] = [];
    for (let i = 0; i < text.length; i += TEXT_PAGE_CHARS) {
      pages.push({
        pageNumber: pages.length + 1,
        content: text.slice(i, i + TEXT_PAGE_CHARS),
      });
    }
    return pages;
  }
}
