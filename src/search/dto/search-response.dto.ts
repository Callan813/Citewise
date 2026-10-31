import { ApiProperty } from '@nestjs/swagger';

export class SearchResultDto {
  @ApiProperty({ format: 'uuid' })
  chunkId: string;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ example: 'DBMS_Notes.pdf' })
  filename: string;

  @ApiProperty({ example: 14 })
  pageNumber: number;

  @ApiProperty()
  content: string;

  @ApiProperty({
    description: 'For ordering results only. Not a measure of relevance.',
  })
  score: number;
}

export class SearchResponseDto {
  @ApiProperty({
    enum: ['hybrid', 'keyword'],
    description: 'keyword means embeddings were unavailable for this search',
  })
  mode: 'hybrid' | 'keyword';

  @ApiProperty({ type: [SearchResultDto] })
  results: SearchResultDto[];
}
