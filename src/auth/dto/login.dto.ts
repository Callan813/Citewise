import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

// No MinLength here on purpose: login should only ever say "wrong email or
// password", never hint at what the rules are.
export class LoginDto {
  @ApiProperty({ example: 'priya@example.com' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'correct-horse-battery' })
  @IsString()
  @MaxLength(128)
  password: string;
}
