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
import { chunkPages, type PageText } from '../documents/chunker.js';
import { DocumentsRepository } from '../documents/documents.repository.js';
import { DocumentStatus } from '../documents/entities/document.entity.js';
import { TextExtractorService } from '../documents/text-extractor.service.js';
import {
  EmbeddingProvider,
  EmbeddingRateLimitError,
} from '../embeddings/embedding.provider.js';
import { StorageService } from '../storage/storage.service.js';
import {
  INGESTION_QUEUE,
  type IngestionJobData,
} from './ingestion-queue.service.js';

const GENERIC_FAILURE = 'Processing failed. Please try uploading again.';
const EMBEDDING_BATCH_SIZE = 50;

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
    private readonly embeddings: EmbeddingProvider,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IngestionProcessor.name);
  }

  onApplicationBootstrap(): void {
    this.worker = new Worker<IngestionJobData>(
      INGESTION_QUEUE,
      (job) => this.handle(job),
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

  private async handle(job: Job<IngestionJobData>): Promise<void> {
    try {
      await this.process(job.data.documentId);
    } catch (err) {
      // Pause the whole queue and put this job back, without counting an attempt.
      if (err instanceof EmbeddingRateLimitError && this.worker) {
        this.logger.warn(
          { documentId: job.data.documentId, waitMs: err.retryAfterMs },
          'Embedding rate limit reached, pausing the queue',
        );
        await this.worker.rateLimit(err.retryAfterMs);
        throw Worker.RateLimitError();
      }
      throw err;
    }
  }

  // Safe to run more than once, and it resumes rather than restarts. A job can
  // repeat after a retry or a worker crash, and each finished step is skipped,
  // so already embedded chunks don't use up API quota again.
  async process(documentId: string): Promise<void> {
    const document = await this.documents.findById(documentId);
    // Deleted while waiting in the queue, or already finished by an earlier run.
    if (document?.status !== DocumentStatus.PROCESSING) return;

    if ((await this.documents.countChunks(documentId)) === 0) {
      // Documents from before chunks existed already have pages to reuse.
      const stored = await this.documents.findPages(documentId);
      const pages: PageText[] =
        stored.length > 0 ? stored : await this.extractFile(document);
      await this.documents.saveExtraction(documentId, pages, chunkPages(pages));
    }

    await this.embedChunks(documentId);
    await this.documents.markReady(documentId);
  }

  private async extractFile(document: {
    storageKey: string | null;
    mimeType: string;
  }): Promise<PageText[]> {
    if (!document.storageKey) throw new UnrecoverableError(GENERIC_FAILURE);
    const file = await this.storage.read(document.storageKey);
    return this.extract(file, document.mimeType);
  }

  private async embedChunks(documentId: string): Promise<void> {
    for (;;) {
      const chunks = await this.documents.findUnembeddedChunks(
        documentId,
        EMBEDDING_BATCH_SIZE,
      );
      if (chunks.length === 0) return;

      const vectors = await this.embeddings.embedDocuments(
        chunks.map((chunk) => chunk.content),
      );
      await this.documents.saveEmbeddings(
        chunks.map((chunk, i) => ({ id: chunk.id, vector: vectors[i] })),
      );
    }
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
