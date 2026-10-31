import { ApiProperty } from '@nestjs/swagger';

export class UsageResponseDto {
  @ApiProperty()
  questionsUsed: number;

  @ApiProperty()
  questionsLimit: number;

  @ApiProperty()
  uploadsUsed: number;

  @ApiProperty()
  uploadsLimit: number;

  @ApiProperty({ description: 'Chat model tokens sent today' })
  inputTokens: number;

  @ApiProperty({ description: 'Chat model tokens received today' })
  outputTokens: number;
}
