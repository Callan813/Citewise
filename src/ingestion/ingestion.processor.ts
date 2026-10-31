import {
  HttpException,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { AppConfig } from '../config/configuration.js';
import { DocumentsRepository } from '../documents/documents.repository.js';
import { DocumentStatus } from '../documents/entities/document.entity.js';
import { TextExtractorService } from '../documents/text-extractor.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  INGESTION_QUEUE,
  type IngestionJobData,
} from './ingestion-queue.service.js';

const GENERIC_FAILURE = 'Processing failed. Please try uploading again.';

@Injectable()
export class IngestionProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker?: Worker<IngestionJobData>;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly documents: DocumentsRepository,
    private readonly extractor: TextExtractorService,
    private readonly storage: StorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IngestionProcessor.name);
  }

  onApplicationBootstrap(): void {
    this.worker = new Worker<IngestionJobData>(
      INGESTION_QUEUE,
      (job) => this.process(job.data.documentId),
      {
        connection: {
          ...this.config.get('redis', { infer: true }),
          // Workers wait out Redis outages instead of failing their commands.
          maxRetriesPerRequest: null,
        },
        concurrency: 2,
        // PDF parsing can hold the CPU for a while, so allow extra time before
        // a busy worker is mistaken for a dead one.
        lockDuration: 60_000,
      },
    );
    this.worker.on('error', (err) => {
      this.logger.error({ err }, 'Worker connection error');
    });
    this.worker.on('completed', (job) => {
      this.logger.info({ documentId: job.data.documentId }, 'Document ready');
    });
    this.worker.on('failed', (job, err) => void this.onFailed(job, err));
  }

  // Safe to run more than once for the same document. A job can repeat after a
  // retry or a worker crash, and the repository replaces any earlier pages.
  async process(documentId: string): Promise<void> {
    const document = await this.documents.findById(documentId);
    // Deleted while waiting in the queue, or already finished by an earlier run.
    if (document?.status !== DocumentStatus.PROCESSING) return;
    if (!document.storageKey) throw new UnrecoverableError(GENERIC_FAILURE);

    const file = await this.storage.read(document.storageKey);
    const pages = await this.extract(file, document.mimeType);
    await this.documents.completeIngestion(documentId, pages);
  }

  private async extract(file: Buffer, mimeType: string) {
    try {
      return await this.extractor.extract(
        file,
        mimeType as 'application/pdf' | 'text/plain',
      );
    } catch (err) {
      // A corrupt or scanned file will fail the same way every time, so
      // retrying only wastes work. These messages are safe to show the user.
      if (err instanceof HttpException) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  }

  // Runs after every failed attempt, but the document only changes once no
  // retries are left. This also catches jobs that stalled too many times.
  private async onFailed(
    job: Job<IngestionJobData> | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) return;
    const permanent = err instanceof UnrecoverableError;
    const finished = permanent || job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.warn(
      { err, documentId: job.data.documentId, attempt: job.attemptsMade },
      finished ? 'Document failed' : 'Document attempt failed, will retry',
    );
    if (!finished) return;

    try {
      await this.documents.markFailed(
        job.data.documentId,
        permanent ? err.message : GENERIC_FAILURE,
      );
    } catch (markError) {
      this.logger.error(
        { err: markError, documentId: job.data.documentId },
        'Could not mark document as failed',
      );
    }
  }

  // close() waits for running jobs, so a deploy doesn't cut one off halfway.
  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
