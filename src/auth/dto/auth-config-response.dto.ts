import { ApiProperty } from '@nestjs/swagger';

export class AuthConfigResponseDto {
  // A client ID isn't secret: it appears in every browser using the button.
  @ApiProperty({ type: String, nullable: true })
  googleClientId: string | null;
}
