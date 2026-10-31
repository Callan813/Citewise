import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { AppConfig } from '../../config/configuration.js';

// One logger for the whole app. In production it writes one JSON object per
// line (easy for Loki/CloudWatch/Datadog to ingest); in dev it pretty-prints.
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const isProd = config.get('env', { infer: true }) === 'production';
        return {
          pinoHttp: {
            level: config.get('logLevel', { infer: true }),
            // Reuse an incoming x-request-id (e.g. from a load balancer) or make
            // one. Every log line for this request carries it as req.id.
            genReqId: (req, res) => {
              // The header comes from the client, so only accept a safe format.
              const existing = req.headers['x-request-id'];
              const id =
                typeof existing === 'string' && /^[\w-]{1,128}$/.test(existing)
                  ? existing
                  : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            // We log requests ourselves in RequestLoggingMiddleware.
            autoLogging: false,
            // Only the id: headers and query strings can hold secrets, and the
            // middleware already logs the method and path.
            serializers: { req: (req: { id: string }) => ({ id: req.id }) },
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
