import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'priya@example.com' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  // The max length isn't about security policy: hashing is deliberately slow,
  // and a 10 MB "password" would be a cheap way to burn our CPU.
  @ApiProperty({
    example: 'correct-horse-battery',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
