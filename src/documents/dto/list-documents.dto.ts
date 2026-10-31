import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class ListDocumentsDto {
  // Capped so that one request can't ask for the whole table.
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) // query string values always arrive as strings
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
