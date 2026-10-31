import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { DocumentsService } from './documents.service.js';
import {
  DocumentListResponseDto,
  DocumentPageNumbersResponseDto,
  DocumentPageResponseDto,
  DocumentResponseDto,
} from './dto/document-response.dto.js';
import { ListDocumentsDto } from './dto/list-documents.dto.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // 202: the file is accepted but not processed yet. Clients watch its status.
  // The limit makes multer stop reading oversized uploads, and defParamCharset
  // keeps non-English filenames from being garbled.
  @Post('upload')
  @RateLimit('upload', 10, 60)
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      defParamCharset: 'utf8',
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiAcceptedResponse({ type: DocumentResponseDto })
  @ApiPayloadTooLargeResponse({ description: 'File is larger than 10 MB' })
  @ApiUnsupportedMediaTypeResponse({ description: 'Not a PDF or text file' })
  @ApiServiceUnavailableResponse({ description: 'The job queue is down' })
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<DocumentResponseDto> {
    if (!file) throw new BadRequestException('A "file" field is required');
    const document = await this.documents.upload(user.id, file);
    return DocumentResponseDto.from(document, user.id);
  }

  @Get()
  @ApiOkResponse({ type: DocumentListResponseDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListDocumentsDto,
  ): Promise<DocumentListResponseDto> {
    const [documents, total] = await this.documents.list(
      user.id,
      query.limit,
      query.offset,
    );
    return {
      items: documents.map((doc) => DocumentResponseDto.from(doc, user.id)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  @Get(':id')
  @ApiOkResponse({ type: DocumentResponseDto })
  @ApiNotFoundResponse({ description: 'Missing, or not visible to this user' })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentResponseDto> {
    const document = await this.documents.getVisible(id, user.id);
    return DocumentResponseDto.from(document, user.id);
  }

  @Get(':id/pages')
  @ApiOkResponse({ type: DocumentPageNumbersResponseDto })
  @ApiNotFoundResponse({ description: 'Missing, or not visible to this user' })
  async getPageNumbers(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DocumentPageNumbersResponseDto> {
    return { pageNumbers: await this.documents.getPageNumbers(id, user.id) };
  }

  @Get(':id/pages/:pageNumber')
  @ApiOkResponse({ type: DocumentPageResponseDto })
  @ApiNotFoundResponse({ description: 'Missing, or not visible to this user' })
  async getPage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
  ): Promise<DocumentPageResponseDto> {
    const page = await this.documents.getPage(id, pageNumber, user.id);
    return { pageNumber: page.pageNumber, content: page.content };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiForbiddenResponse({
    description: 'Public document owned by someone else',
  })
  @ApiNotFoundResponse({ description: 'Missing, or not visible to this user' })
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.documents.delete(id, user.id);
  }
}
