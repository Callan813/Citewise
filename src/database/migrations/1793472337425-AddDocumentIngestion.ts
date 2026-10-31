import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentIngestion1793472337425 implements MigrationInterface {
  name = 'AddDocumentIngestion1793472337425';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" ADD "storage_key" character varying(255)`,
    );
    await queryRunner.query(`ALTER TABLE "documents" ADD "error" text`);
    await queryRunner.query(
      `ALTER TABLE "documents" ALTER COLUMN "page_count" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'processing'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'ready'`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ALTER COLUMN "page_count" DROP DEFAULT`,
    );
    await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "error"`);
    await queryRunner.query(
      `ALTER TABLE "documents" DROP COLUMN "storage_key"`,
    );
  }
}
