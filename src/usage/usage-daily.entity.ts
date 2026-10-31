import { Column, Entity, PrimaryColumn } from 'typeorm';

// One row per day for each user, plus one for the whole app under scope "global".
// In Postgres rather than Redis, because a quota has to survive a cache restart.
@Entity('usage_daily')
export class UsageDaily {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  scope: string;

  @PrimaryColumn({ type: 'date' })
  day: string;

  @Column({ type: 'integer', default: 0 })
  questions: number;

  @Column({ type: 'integer', default: 0 })
  uploads: number;

  @Column({ name: 'input_tokens', type: 'integer', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 })
  outputTokens: number;
}
