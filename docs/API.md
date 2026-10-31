# API examples

Interactive docs are at `/docs` locally and `/api/docs` when deployed. Examples use `http://localhost:4000`. Protected routes need `Authorization: Bearer <token>`.

Every error has the same shape:

```json
{
  "statusCode": 404,
  "error": "NOT_FOUND",
  "message": "Document not found",
  "path": "/documents/92955541-2566-422e-b7c6-000000000000",
  "requestId": "0a1d69f7-a819-4c3c-89fb-d69421251834",
  "timestamp": "2026-11-01T18:04:57.960Z"
}
```

## Sign up and log in

```bash
curl -X POST http://localhost:4000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"priya@example.com","password":"correct-horse-battery"}'
```

`POST /auth/login` takes the same body. Both return:

```json
{
  "accessToken": "eyJhbGciOi...",
  "tokenType": "Bearer",
  "expiresIn": "1h",
  "user": {
    "id": "fe94772e-58f0-4d5e-81b6-a7225ff6180a",
    "email": "priya@example.com",
    "createdAt": "2026-11-01T20:08:20.263Z"
  }
}
```

`POST /auth/google` takes `{ "idToken": "..." }` from Google Sign-In. `GET /auth/config` says whether it's available.

## Upload a document

```bash
curl -X POST http://localhost:4000/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@DBMS_Notes.pdf"
```

Returns `202 Accepted`, because processing happens in the background:

```json
{
  "id": "92955541-2566-422e-b7c6-4a1c9f7e3d10",
  "filename": "DBMS_Notes.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1146,
  "pageCount": 0,
  "status": "processing",
  "error": null,
  "visibility": "private",
  "isOwner": true,
  "uploadDate": "2026-11-01T18:49:26.509Z"
}
```

Check `GET /documents/:id` until `status` is `ready` or `failed`. A failed document explains why in `error`.

## Other document routes

| Route | Purpose |
|---|---|
| `GET /documents?limit=20&offset=0` | Your documents plus public ones |
| `GET /documents/:id` | One document's details |
| `GET /documents/:id/pages` | Its page numbers, which can have gaps because blank pages are skipped |
| `GET /documents/:id/pages/:pageNumber` | One page's text |
| `DELETE /documents/:id` | Deletes a document you own, returning `204` |

## Ask a question

```bash
curl -X POST http://localhost:4000/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"question":"What are the four conditions for deadlock?"}'
```

```json
{
  "answer": "The four Coffman conditions for deadlock are mutual exclusion, hold and wait, no preemption, and circular wait [1].",
  "sources": [
    {
      "number": 1,
      "documentId": "91186f7d-2296-4773-b84e-284d54192b48",
      "filename": "Operating_Systems_Notes.txt",
      "pageNumber": 1,
      "content": "Deadlock\nA deadlock is a state where a set of processes wait forever..."
    }
  ],
  "mode": "hybrid",
  "cached": false
}
```

When nothing relevant is found, the model isn't called and no quota is used:

```json
{
  "answer": "I couldn't find that in your documents.",
  "sources": [],
  "mode": "hybrid",
  "cached": false
}
```

## Stream an answer

`POST /ask/stream` takes the same body and sends server-sent events:

```text
event: delta
data: {"text":"A page"}

event: delta
data: {"text":" fault occurs when a page is not in RAM [1]."}

event: done
data: {"sources":[...],"mode":"hybrid","cached":false}
```

A failure partway through arrives as `event: error` with `{ "message": "..." }`, because the `200` status has already been sent by then.

## Search for passages

```bash
curl -X POST http://localhost:4000/search \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query":"two programs waiting on each other","limit":5}'
```

`mode` is `keyword` if embeddings were unavailable for that search. `score` is only for ordering, and isn't a measure of relevance.

## Usage and limits

`GET /users/me/usage` returns today's usage:

```json
{
  "questionsUsed": 3,
  "questionsLimit": 30,
  "uploadsUsed": 1,
  "uploadsLimit": 20,
  "inputTokens": 1840,
  "outputTokens": 212
}
```

Going over a limit returns `429`. Rate limits also include a `Retry-After` header.

| Route | Rate limit |
|---|---|
| `POST /auth/login` | 10 per minute per IP |
| `POST /auth/register` | 5 per hour per IP |
| `POST /auth/google` | 20 per minute per IP |
| `POST /ask`, `POST /ask/stream` | 10 per minute per user, shared |
| `POST /search` | 30 per minute per user |
| `POST /documents/upload` | 10 per minute per user |

## System

`GET /health` returns `200` when Postgres and Redis are reachable, and `503` when they aren't. `GET /metrics` serves Prometheus metrics and needs `Authorization: Bearer <METRICS_TOKEN>`.
