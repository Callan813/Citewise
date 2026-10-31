import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class AuthResponseDto {
  @ApiProperty({ description: 'Send as "Authorization: Bearer <token>"' })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: '1h' })
  expiresIn: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
