import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'The ID token from Google Sign-In' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken: string;
}
