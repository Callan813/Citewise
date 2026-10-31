import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import {
  type AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { AskResponseDto } from './dto/ask-response.dto.js';
import { AskDto } from './dto/ask.dto.js';
import { FAILED_MESSAGE, QaService, userMessageFor } from './qa.service.js';

@ApiTags('Questions')
@ApiBearerAuth()
@Controller('ask')
export class QaController {
  constructor(
    private readonly qa: QaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QaController.name);
  }

  @Post()
  @RateLimit('ask', 10, 60)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AskResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'The AI service is unavailable',
  })
  ask(
    @CurrentUser() user: AuthUser,
    @Body() dto: AskDto,
  ): Promise<AskResponseDto> {
    return this.qa.ask(user.id, dto.question);
  }

  @Post('stream')
  @RateLimit('ask', 10, 60)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask, and receive the answer as server-sent events',
    description:
      'Sends "delta" events with { text } as the answer is written, then one "done" event with { sources, mode, cached }, or an "error" event with { message }.',
  })
  @ApiProduces('text/event-stream')
  async stream(
    @CurrentUser() user: AuthUser,
    @Body() dto: AskDto,
    @Res() res: Response,
  ): Promise<void> {
    // Done before any headers go out, so a failure here is still a normal error
    // response. Once streaming starts, the status code can't change.
    const prepared = await this.qa.prepare(user.id, dto.question);

    res.status(HttpStatus.OK).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tells reverse proxies not to hold it back
    });
    res.flushHeaders();

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // If the user leaves, stop generating rather than spend quota on nobody.
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    let answer = '';
    try {
      for await (const text of this.qa.generate(prepared, abort.signal)) {
        answer += text;
        send('delta', { text });
      }
      if (answer.trim()) {
        const { sources, mode, cached } = await this.qa.finish(
          prepared,
          answer,
        );
        send('done', { sources, mode, cached });
      } else {
        send('error', { message: FAILED_MESSAGE });
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        this.logger.error({ err }, 'Answer stream failed');
        send('error', { message: userMessageFor(err) });
      }
    }
    res.end();
  }
}
