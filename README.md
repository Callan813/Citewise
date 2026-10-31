# Citewise

Ask your documents questions and get answers that cite the exact page. You upload PDFs and text files, and every answer shows where it came from. I'm building it in phases to learn backend engineering and deployment properly.

**Status:** work in progress. Accounts, background document processing and a small frontend work today. Asking questions doesn't work yet.

## What works so far

- Sign up with email and password (hashed with argon2) or continue with Google, using JWT access tokens either way
- Upload PDF and text files up to 10 MB, checked by their actual bytes rather than their extension
- Uploads return right away while a separate worker process extracts the text, with retries and a status you can watch
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

- Embeddings and hybrid search
- Asking questions, with cited and streamed answers
- Caching, rate limits and usage quotas
- An evaluation suite for answer quality
- Deployment
