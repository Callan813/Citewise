import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SearchDto {
  @ApiProperty({ example: 'difference between 2NF and 3NF', maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}
