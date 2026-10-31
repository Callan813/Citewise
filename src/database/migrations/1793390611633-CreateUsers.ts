import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1793390611633 implements MigrationInterface {
  name = 'CreateUsers1793390611633';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" character varying(320) NOT NULL, "password_hash" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_email" ON "users"  ("email") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
