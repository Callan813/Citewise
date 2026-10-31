# Citewise

Ask your documents questions and get answers that cite the exact page. You upload PDFs and text files, and every answer shows where it came from. I'm building it in phases to learn backend engineering and deployment properly.

**Status:** work in progress. Accounts, document processing, search and asking questions all work. Limits and deployment are next.

## What works so far

- Sign up with email and password (hashed with argon2) or continue with Google, using JWT access tokens either way
- Upload PDF and text files up to 10 MB, checked by their actual bytes rather than their extension
- Uploads return right away while a separate worker process extracts the text, with retries and a status you can watch
- Text stored per page, so results can cite page numbers
- Hybrid search that combines meaning (pgvector) with keywords (Postgres full-text), merged with reciprocal rank fusion
- Answers from Gemini, streamed word by word over server-sent events, with citations that open the exact page
- If nothing relevant is found, it says so without calling the model
- Private documents plus a public type that everyone can read
- Structured logs with request IDs, one error format, a health check and Swagger docs

## Stack

NestJS, TypeScript, PostgreSQL with pgvector, Redis, TypeORM, Docker Compose, and React with Vite and Tailwind for the frontend.

## Run it locally

You need Node 24 and Docker.

```bash
cp .env.example .env
npm install
npm --prefix frontend install
docker compose up -d
npm run migration:run
npm run dev
```

Set `JWT_SECRET` in `.env` before starting. `.env.example` has a command that generates one. Search and answers need a free `GEMINI_API_KEY`, or set `AI_PROVIDER=fake` to run offline with placeholder results.

Documents uploaded before search existed can be indexed with `npm run reindex` after a build.

`npm run dev` starts the API, the worker and the frontend together.

Google sign-in is optional. To turn it on, create an OAuth client ID in Google Cloud, add `http://localhost` and `http://localhost:5173` as authorized JavaScript origins, and set `GOOGLE_CLIENT_ID` in `.env`.

- App: http://localhost:5173
- API docs: http://localhost:4000/docs
- Health check: http://localhost:4000/health

## Tests

The end-to-end tests run against a separate `docintel_test` database that Docker creates on first start.

```bash
npm test
npm run test:e2e
```

## What's next

- Caching, rate limits and usage quotas
- An evaluation suite for answer quality
- Deployment
