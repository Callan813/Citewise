# Document Intelligence Service

A backend where you upload PDFs and text files and ask questions about them, with answers that cite the page they came from. I'm building it in phases to learn backend engineering and deployment properly.

**Status:** work in progress. Accounts, uploads, page-by-page text extraction and a small frontend work today. Asking questions doesn't work yet.

## What works so far

- Sign up and log in with JWT access tokens and argon2 password hashing
- Upload PDF and text files up to 10 MB, checked by their actual bytes rather than their extension
- Text stored per page, so answers can cite page numbers later
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

Set `JWT_SECRET` in `.env` before starting. `.env.example` has a command that generates one.

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

- Background processing for uploads with a job queue
- Embeddings and hybrid search
- Asking questions, with cited and streamed answers
- Caching, rate limits and usage quotas
- An evaluation suite for answer quality
- Deployment
