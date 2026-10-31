import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface SearchRow {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_number: number;
  content: string;
  score: number;
}

// How many results each method contributes before they're merged.
const CANDIDATES = 30;
// The usual constant for reciprocal rank fusion. It stops the top few ranks from
// completely dominating the merged score.
const RRF_K = 60;

// The access rule. Every search has to apply it: filtering afterwards in code
// would risk someone else's private text passing through the system.
const SEARCHABLE = `
  d.status = 'ready'
  AND (d.user_id = $1 OR d.visibility = 'public')
`;

const VECTOR_HITS = `
  SELECT id, ROW_NUMBER() OVER (ORDER BY distance) AS rank FROM (
    SELECT c.id, c.embedding <=> $4::vector AS distance
    FROM chunks c JOIN documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL AND ${SEARCHABLE}
    ORDER BY distance
    LIMIT $5
  ) nearest
  WHERE distance <= $6
`;
const NO_VECTOR_HITS = `SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE false`;

const KEYWORD_HITS = `
    SELECT id, ROW_NUMBER() OVER (ORDER BY text_rank DESC) AS rank FROM (
      SELECT c.id, ts_rank_cd(to_tsvector('english', c.content), query) AS text_rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id,
      websearch_to_tsquery('english', $2) AS query
      WHERE to_tsvector('english', c.content) @@ query AND ${SEARCHABLE}
      ORDER BY text_rank DESC
      LIMIT ${CANDIDATES}
    ) matched
`;

const buildQuery = (vectorHits: string, keywordHits = KEYWORD_HITS) => `
  WITH vector_hits AS (${vectorHits}),
  keyword_hits AS (${keywordHits}),
  fused AS (
    SELECT
      COALESCE(v.id, k.id) AS id,
      COALESCE(1.0 / (${RRF_K} + v.rank), 0)
        + COALESCE(1.0 / (${RRF_K} + k.rank), 0) AS score
    FROM vector_hits v FULL OUTER JOIN keyword_hits k ON v.id = k.id
  )
  SELECT
    c.id AS chunk_id, c.document_id, d.filename, c.page_number, c.content,
    f.score::float8 AS score
  FROM fused f
  JOIN chunks c ON c.id = f.id
  JOIN documents d ON d.id = c.document_id
  ORDER BY f.score DESC, c.id
  LIMIT $3
`;

@Injectable()
export class SearchRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // A fingerprint of the documents this user can currently see. It changes
  // whenever a document is added, finished or removed.
  async corpusFingerprint(userId: string): Promise<string> {
    const [row] = (await this.db.query(
      `SELECT md5(COALESCE(string_agg(d.id::text, ',' ORDER BY d.id), '')) AS hash
       FROM documents d WHERE ${SEARCHABLE}`,
      [userId],
    )) as { hash: string }[];
    return row.hash;
  }

  // Pass no vector to search by keywords alone. keywords: false is only used by
  // the evaluation, to measure what each method contributes.
  search(
    userId: string,
    query: string,
    vector: number[] | null,
    limit: number,
    maxDistance: number,
    keywords = true,
  ): Promise<SearchRow[]> {
    if (!vector) {
      return this.db.query(buildQuery(NO_VECTOR_HITS), [userId, query, limit]);
    }
    return this.db.transaction(async (tx) => {
      // HNSW finds nearest neighbours first and applies the access filter after,
      // so a user with few documents could get too few results. This keeps it
      // scanning until the limit is met. SET LOCAL ends with the transaction.
      await tx.query(`SET LOCAL hnsw.iterative_scan = relaxed_order`);
      const keywordHits = keywords
        ? KEYWORD_HITS
        : `SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE $2::text IS NULL`;
      return tx.query(buildQuery(VECTOR_HITS, keywordHits), [
        userId,
        query,
        limit,
        JSON.stringify(vector),
        CANDIDATES,
        maxDistance,
      ]) as Promise<SearchRow[]>;
    });
  }
}
