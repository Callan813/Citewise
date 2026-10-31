import { ApiProperty } from '@nestjs/swagger';
import {
  type Document,
  DocumentStatus,
  DocumentVisibility,
} from '../entities/document.entity.js';

export class DocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'DBMS_Notes.pdf' })
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty({ description: 'Pages that contain text' })
  pageCount: number;

  @ApiProperty({ enum: DocumentStatus })
  status: DocumentStatus;

  @ApiProperty({ type: String, nullable: true })
  error: string | null;

  @ApiProperty({ enum: DocumentVisibility })
  visibility: DocumentVisibility;

  @ApiProperty({ description: 'Whether the current user owns this document' })
  isOwner: boolean;

  @ApiProperty()
  uploadDate: Date;

  // user_id stays private: public documents shouldn't expose who owns them.
  static from(document: Document, userId: string): DocumentResponseDto {
    return {
      id: document.id,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      pageCount: document.pageCount,
      status: document.status,
      error: document.error,
      visibility: document.visibility,
      isOwner: document.userId === userId,
      uploadDate: document.uploadDate,
    };
  }
}

export class DocumentListResponseDto {
  @ApiProperty({ type: [DocumentResponseDto] })
  items: DocumentResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;
}

export class DocumentPageNumbersResponseDto {
  // Blank PDF pages aren't stored, so the numbers can have gaps.
  @ApiProperty({ type: [Number], example: [1, 3, 4] })
  pageNumbers: number[];
}

export class DocumentPageResponseDto {
  @ApiProperty()
  pageNumber: number;

  @ApiProperty()
  content: string;
}
