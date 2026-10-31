import { ApiProperty } from '@nestjs/swagger';

export class AskSourceDto {
  @ApiProperty({ description: 'Matches a citation like [2] in the answer' })
  number: number;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ example: 'DBMS_Notes.pdf' })
  filename: string;

  @ApiProperty({ example: 14 })
  pageNumber: number;

  @ApiProperty()
  content: string;
}

export class AskResponseDto {
  @ApiProperty()
  answer: string;

  @ApiProperty({ type: [AskSourceDto] })
  sources: AskSourceDto[];

  @ApiProperty({
    enum: ['hybrid', 'keyword'],
    description: 'keyword means embeddings were unavailable for this question',
  })
  mode: 'hybrid' | 'keyword';

  @ApiProperty({ description: 'Whether this came from the answer cache' })
  cached: boolean;
}
