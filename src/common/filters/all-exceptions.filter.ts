import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  requestId?: string;
  timestamp: string;
}

// Every error leaves the API in the same shape, so clients only need one
// error handler. Unexpected errors are logged with their stack but the client
// only sees a generic 500 - never leak internals.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
    }

    if (status >= 500) {
      this.logger.error({ err: exception }, 'Unhandled exception');
    }

    const payload: ErrorResponse = {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: req.originalUrl.split('?')[0],
      requestId: req.id,
      timestamp: new Date().toISOString(),
    };

    res.status(status).json(payload);
  }
}
