import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChunks1793478925098 implements MigrationInterface {
  name = 'CreateChunks1793478925098';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chunks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "document_id" uuid NOT NULL, "chunk_index" integer NOT NULL, "page_number" integer NOT NULL, "content" text NOT NULL, "embedding" vector(768), CONSTRAINT "PK_a306e60b8fdf6e7de1be4be1e6a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_chunks_document_index" ON "chunks"  ("document_id", "chunk_index") `,
    );
    await queryRunner.query(
      `ALTER TABLE "chunks" ADD CONSTRAINT "FK_d841de45a719fe1f35213d79207" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Written by hand, because TypeORM can't express these. Cosine distance for
    // meaning search, and an index on the expression that keyword search uses.
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_embedding" ON "chunks" USING hnsw ("embedding" vector_cosine_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_content_tsv" ON "chunks" USING gin (to_tsvector('english', "content"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "chunks"`);
  }
}
