import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { MetricsService } from '../metrics/metrics.service.js';
import type { UsageResponseDto } from './dto/usage-response.dto.js';

const GLOBAL_SCOPE = 'global';
type Counter = 'questions' | 'uploads';

@Injectable()
export class UsageService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly metrics: MetricsService,
  ) {}

  // Checks both limits. The whole-app limit exists because every user shares one
  // free Gemini quota, so many small accounts can't drain it for everyone.
  async consumeQuestion(userId: string): Promise<void> {
    const limits = this.config.get('limits', { infer: true });
    await this.db.transaction(async (tx) => {
      if (
        !(await this.increment(tx, userId, 'questions', limits.dailyQuestions))
      ) {
        this.reject(
          'questions',
          `You've used all ${limits.dailyQuestions} of today's questions. Please come back tomorrow.`,
        );
      }
      if (
        !(await this.increment(
          tx,
          GLOBAL_SCOPE,
          'questions',
          limits.dailyQuestionsGlobal,
        ))
      ) {
        this.reject(
          'global',
          "The demo has reached today's limit. Please come back tomorrow.",
        );
      }
    });
  }

  async consumeUpload(userId: string): Promise<void> {
    const limits = this.config.get('limits', { infer: true });
    const allowed = await this.increment(
      this.db.manager,
      userId,
      'uploads',
      limits.dailyUploads,
    );
    if (!allowed) {
      this.reject(
        'uploads',
        `You've used all ${limits.dailyUploads} of today's uploads. Please come back tomorrow.`,
      );
    }
  }

  async addTokens(
    userId: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    this.metrics.aiTokens.inc({ direction: 'input' }, inputTokens);
    this.metrics.aiTokens.inc({ direction: 'output' }, outputTokens);
    for (const scope of [userId, GLOBAL_SCOPE]) {
      await this.db.query(
        `INSERT INTO usage_daily (scope, day, input_tokens, output_tokens)
         VALUES ($1, CURRENT_DATE, $2, $3)
         ON CONFLICT (scope, day) DO UPDATE SET
           input_tokens = usage_daily.input_tokens + EXCLUDED.input_tokens,
           output_tokens = usage_daily.output_tokens + EXCLUDED.output_tokens`,
        [scope, inputTokens, outputTokens],
      );
    }
  }

  async today(userId: string): Promise<UsageResponseDto> {
    const limits = this.config.get('limits', { infer: true });
    const rows = (await this.db.query(
      `SELECT questions, uploads, input_tokens, output_tokens
       FROM usage_daily WHERE scope = $1 AND day = CURRENT_DATE`,
      [userId],
    )) as {
      questions: number;
      uploads: number;
      input_tokens: number;
      output_tokens: number;
    }[];
    const row = rows.at(0);
    return {
      questionsUsed: row?.questions ?? 0,
      questionsLimit: limits.dailyQuestions,
      uploadsUsed: row?.uploads ?? 0,
      uploadsLimit: limits.dailyUploads,
      inputTokens: row?.input_tokens ?? 0,
      outputTokens: row?.output_tokens ?? 0,
    };
  }

  // One atomic statement, so two requests at once can't both squeeze past the
  // limit. Returns no row when the limit is already reached.
  private async increment(
    manager: EntityManager,
    scope: string,
    counter: Counter,
    limit: number,
  ): Promise<boolean> {
    const rows = (await manager.query(
      `INSERT INTO usage_daily (scope, day, ${counter})
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (scope, day) DO UPDATE
         SET ${counter} = usage_daily.${counter} + 1
         WHERE usage_daily.${counter} < $2
       RETURNING ${counter}`,
      [scope, limit],
    )) as unknown[];
    return rows.length > 0;
  }

  private reject(kind: string, message: string): never {
    this.metrics.quotaRejected.inc({ kind });
    throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
