import {
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { AppConfig } from '../config/configuration.js';

export const INGESTION_QUEUE = 'document-ingestion';

export interface IngestionJobData {
  documentId: string;
}

// The API side of the queue: it adds jobs and never processes them.
@Injectable()
export class IngestionQueueService implements OnApplicationShutdown {
  private readonly queue: Queue<IngestionJobData>;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IngestionQueueService.name);
    const redis = config.get('redis', { infer: true });
    this.queue = new Queue<IngestionJobData>(INGESTION_QUEUE, {
      connection: {
        ...redis,
        // Fail right away when Redis is down. Otherwise commands wait for a
        // reconnect and the upload request hangs.
        enableOfflineQueue: false,
      },
    });
    // Without a listener, a connection error would crash the process.
    this.queue.on('error', (err) => {
      this.logger.error({ err }, 'Queue connection error');
    });
  }

  async enqueue(documentId: string): Promise<void> {
    try {
      await this.queue.add(
        'ingest',
        { documentId },
        {
          // Adding the same document twice can't create a second job.
          jobId: documentId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      );
    } catch (err) {
      this.logger.error({ err, documentId }, 'Could not enqueue document');
      throw new ServiceUnavailableException(
        'Uploads are temporarily unavailable. Please try again shortly.',
      );
    }
  }

  // Throws if Redis can't answer. Used by the health check.
  async ping(): Promise<void> {
    await this.queue.getWaitingCount();
  }

  waitUntilReady(): Promise<void> {
    return this.queue.waitUntilReady();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
