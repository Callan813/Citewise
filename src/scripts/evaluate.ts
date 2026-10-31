import { readFile, writeFile } from 'node:fs/promises';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { LoggerModule } from '../common/logger/logger.module.js';
import { type AppConfig, configuration } from '../config/configuration.js';
import { validateEnv } from '../config/env.validation.js';
import { DatabaseModule } from '../database/database.module.js';
import { chunkPages } from '../documents/chunker.js';
import { DocumentsRepository } from '../documents/documents.repository.js';
import { DocumentStatus } from '../documents/entities/document.entity.js';
import { TextExtractorService } from '../documents/text-extractor.service.js';
import { EmbeddingProvider } from '../embeddings/embedding.provider.js';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { ChatProvider } from '../qa/chat.provider.js';
import { GeminiChatProvider } from '../qa/gemini-chat.provider.js';
import { buildPrompt, NOT_FOUND_ANSWER, SYSTEM_PROMPT } from '../qa/prompt.js';
import {
  SearchRepository,
  type SearchRow,
} from '../search/search.repository.js';
import { User } from '../users/user.entity.js';
import { readLibrary } from './library.js';

// Measures retrieval and answers on a fixed question set, so changes to chunking
// or search can be judged by numbers. Run it with DATABASE_NAME pointing at a
// scratch database, because it replaces its evaluation user's data.
//   npm run eval                 retrieval only
//   npm run eval -- --answers    also calls the chat model for every question

interface Dataset {
  answerable: {
    question: string;
    file: string;
    passage: string;
    answer: string[];
  }[];
  unanswerable: string[];
}

const EVAL_USER = 'eval@citewise.invalid';
const K = 5;
const BATCH = 50;
const NO_CUTOFF = 2;
const CHAT_PAUSE_MS = 5000; // stays within free-tier requests per minute

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule,
    DatabaseModule,
    EmbeddingsModule,
  ],
  providers: [
    SearchRepository,
    DocumentsRepository,
    TextExtractorService,
    { provide: ChatProvider, useClass: GeminiChatProvider },
  ],
})
class EvalModule {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const percent = (part: number, whole: number) =>
  Math.round((part / whole) * 1000) / 10;

async function main() {
  const withAnswers = process.argv.includes('--answers');
  const app = await NestFactory.createApplicationContext(EvalModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const dataset = JSON.parse(
    await readFile('eval/dataset.json', 'utf8'),
  ) as Dataset;
  const db = app.get(DataSource);
  const repo = app.get(SearchRepository);
  const documents = app.get(DocumentsRepository);
  const extractor = app.get(TextExtractorService);
  const embeddings = app.get(EmbeddingProvider);
  const config = app.get(ConfigService<AppConfig, true>);
  const { maxDistance } = config.get('search', { infer: true });

  // A clean corpus every run.
  const users = db.getRepository(User);
  await users.delete({ email: EVAL_USER });
  const user = await users.save(users.create({ email: EVAL_USER }));
  let chunkTotal = 0;
  for (const { filename, content } of await readLibrary()) {
    const document = await documents.create({
      userId: user.id,
      filename,
      mimeType: 'text/plain',
      sizeBytes: content.length,
      status: DocumentStatus.PROCESSING,
    });
    const pages = await extractor.extract(content, 'text/plain');
    const chunks = chunkPages(pages);
    chunkTotal += chunks.length;
    await documents.saveExtraction(document.id, pages, chunks);
    for (;;) {
      const batch = await documents.findUnembeddedChunks(document.id, BATCH);
      if (batch.length === 0) break;
      const vectors = await embeddings.embedDocuments(
        batch.map((c) => c.content),
      );
      await documents.saveEmbeddings(
        batch.map((c, i) => ({ id: c.id, vector: vectors[i] })),
      );
    }
    await documents.markReady(document.id);
  }

  const questions = [
    ...dataset.answerable.map((a) => a.question),
    ...dataset.unanswerable,
  ];
  const vectors = new Map<string, number[]>();
  for (let i = 0; i < questions.length; i += BATCH) {
    // embedQuery one at a time would burn far more of the request quota.
    for (const question of questions.slice(i, i + BATCH)) {
      vectors.set(question, await embeddings.embedQuery(question));
    }
  }

  type Method = 'vector' | 'keyword' | 'hybrid';
  const run = (question: string, method: Method, cutoff: number) =>
    method === 'keyword'
      ? repo.search(user.id, question, null, K, cutoff)
      : repo.search(
          user.id,
          question,
          vectors.get(question)!,
          K,
          cutoff,
          method === 'hybrid',
        );

  const rankOf = (rows: SearchRow[], file: string, passage: string) =>
    rows.findIndex(
      (row) =>
        row.filename === file &&
        row.content.toLowerCase().includes(passage.toLowerCase()),
    );

  const retrieval: Record<string, unknown> = {};
  for (const method of ['vector', 'keyword', 'hybrid'] as Method[]) {
    let hits1 = 0;
    let hitsK = 0;
    let reciprocal = 0;
    const missed: string[] = [];
    for (const item of dataset.answerable) {
      const rows = await run(item.question, method, NO_CUTOFF);
      const rank = rankOf(rows, item.file, item.passage);
      if (rank === 0) hits1 += 1;
      if (rank !== -1) {
        hitsK += 1;
        reciprocal += 1 / (rank + 1);
      } else {
        missed.push(item.question);
      }
    }
    const total = dataset.answerable.length;
    retrieval[method] = {
      recallAt1: percent(hits1, total),
      [`recallAt${K}`]: percent(hitsK, total),
      mrr: Math.round((reciprocal / total) * 1000) / 1000,
      missed,
    };
  }

  // Does the distance cutoff keep real questions and reject off-topic ones?
  let keptAnswerable = 0;
  for (const item of dataset.answerable) {
    const rows = await run(item.question, 'hybrid', maxDistance);
    if (rankOf(rows, item.file, item.passage) !== -1) keptAnswerable += 1;
  }
  const leaked: string[] = [];
  for (const question of dataset.unanswerable) {
    const rows = await run(question, 'hybrid', maxDistance);
    if (rows.length > 0) leaked.push(question);
  }

  const results: Record<string, unknown> = {
    corpus: { documents: 3, chunks: chunkTotal },
    questions: {
      answerable: dataset.answerable.length,
      unanswerable: dataset.unanswerable.length,
    },
    k: K,
    retrieval,
    cutoff: {
      maxDistance,
      answerableKeptPercent: percent(keptAnswerable, dataset.answerable.length),
      unanswerableBlockedPercent: percent(
        dataset.unanswerable.length - leaked.length,
        dataset.unanswerable.length,
      ),
      reachedModelAnyway: leaked,
    },
  };

  if (withAnswers) {
    const chat = app.get(ChatProvider);
    const answerOnce = async (question: string, rows: SearchRow[]) => {
      if (rows.length === 0) return NOT_FOUND_ANSWER;
      let text = '';
      for await (const part of chat.stream({
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(
          question,
          rows.map((r) => ({
            filename: r.filename,
            pageNumber: r.page_number,
            content: r.content,
          })),
        ),
      })) {
        text += part;
      }
      await sleep(CHAT_PAUSE_MS);
      return text;
    };

    let correct = 0;
    let cited = 0;
    const wrong: { question: string; answer: string }[] = [];
    for (const item of dataset.answerable) {
      const rows = await run(item.question, 'hybrid', maxDistance);
      const answer = await answerOnce(item.question, rows);
      const hasExpected = item.answer.some((term) =>
        answer.toLowerCase().includes(term.toLowerCase()),
      );
      if (hasExpected && !answer.includes(NOT_FOUND_ANSWER)) correct += 1;
      else wrong.push({ question: item.question, answer });
      if (/\[\d+/.test(answer)) cited += 1;
    }

    let refused = 0;
    const invented: { question: string; answer: string }[] = [];
    for (const question of dataset.unanswerable) {
      const rows = await run(question, 'hybrid', maxDistance);
      const answer = await answerOnce(question, rows);
      if (answer.trim().startsWith(NOT_FOUND_ANSWER)) refused += 1;
      else invented.push({ question, answer });
    }

    results.answers = {
      answeredWithExpectedTermPercent: percent(
        correct,
        dataset.answerable.length,
      ),
      includedCitationPercent: percent(cited, dataset.answerable.length),
      correctlyRefusedPercent: percent(refused, dataset.unanswerable.length),
      wrong,
      invented,
    };
  }

  await users.delete({ email: EVAL_USER });
  await writeFile(
    withAnswers ? 'eval/results-answers.json' : 'eval/results.json',
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.log(JSON.stringify(results, null, 2));
  await app.close();
}
await main();
