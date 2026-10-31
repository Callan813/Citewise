import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsageDaily1793481139093 implements MigrationInterface {
  name = 'AddUsageDaily1793481139093';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "usage_daily" ("scope" character varying(64) NOT NULL, "day" date NOT NULL, "questions" integer NOT NULL DEFAULT '0', "uploads" integer NOT NULL DEFAULT '0', "input_tokens" integer NOT NULL DEFAULT '0', "output_tokens" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_9d381e467c3cb229f3925950a77" PRIMARY KEY ("scope", "day"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "usage_daily"`);
  }
}
