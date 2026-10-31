import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';
import { SearchResponseDto } from './dto/search-response.dto.js';
import { SearchDto } from './dto/search.dto.js';
import { SearchService } from './search.service.js';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  // POST so the search text stays out of URLs, which end up in browser history
  // and proxy logs.
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SearchResponseDto })
  run(
    @CurrentUser() user: AuthUser,
    @Body() dto: SearchDto,
  ): Promise<SearchResponseDto> {
    return this.search.search(user.id, dto.query, dto.limit);
  }
}
