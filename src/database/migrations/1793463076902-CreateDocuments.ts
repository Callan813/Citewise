import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocuments1793463076902 implements MigrationInterface {
  name = 'CreateDocuments1793463076902';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "filename" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "size_bytes" integer NOT NULL, "page_count" integer NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'ready', "visibility" character varying(20) NOT NULL DEFAULT 'private', "upload_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_documents_visibility" CHECK (visibility IN ('private', 'public')), CONSTRAINT "chk_documents_status" CHECK (status IN ('processing', 'ready', 'failed')), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_documents_visibility" ON "documents"  ("visibility") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_documents_user_upload" ON "documents"  ("user_id", "upload_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "document_pages" ("document_id" uuid NOT NULL, "page_number" integer NOT NULL, "content" text NOT NULL, CONSTRAINT "PK_fa2d8c48c0d4a9dd12298e7f627" PRIMARY KEY ("document_id", "page_number"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_c7481daf5059307842edef74d73" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_pages" ADD CONSTRAINT "FK_a417941c7fa102ca2b3ebd937c2" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document_pages" DROP CONSTRAINT "FK_a417941c7fa102ca2b3ebd937c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_c7481daf5059307842edef74d73"`,
    );
    await queryRunner.query(`DROP TABLE "document_pages"`);
    await queryRunner.query(`DROP INDEX "public"."idx_documents_user_upload"`);
    await queryRunner.query(`DROP INDEX "public"."idx_documents_visibility"`);
    await queryRunner.query(`DROP TABLE "documents"`);
  }
}
