import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../user.entity.js';

// What the API exposes about a user. Mapping explicitly (instead of returning
// the entity) means a new column can't accidentally end up in responses.
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'priya@example.com' })
  email: string;

  @ApiProperty()
  createdAt: Date;

  static from(user: User): UserResponseDto {
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }
}
