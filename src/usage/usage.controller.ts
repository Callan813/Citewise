import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';
import { UsageResponseDto } from './dto/usage-response.dto.js';
import { UsageService } from './usage.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users/me/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @ApiOkResponse({ type: UsageResponseDto })
  get(@CurrentUser() user: AuthUser): Promise<UsageResponseDto> {
    return this.usage.today(user.id);
  }
}
