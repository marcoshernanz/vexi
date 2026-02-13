# Vexi

Vexi is a DX-first RAG database: define tables in TypeScript, run `vexi sync`, then use a fully type-safe client to `insert`, `update`, and `search`. The Rust API owns storage (LanceDB) and embeddings (Gemini).

v1 non-negotiables:

- No backward compatibility (v1-only endpoints + CLI).
- Schema registry is the contract (no schema inference on write).
- Migrations are additive-only.
- Embeddings provider is Gemini only.

## Quickstart (this repo)

Prereqs: Node.js 18+ and Rust.

1) Build the SDK (also builds the CLI)

```bash
cd sdk
npm install
npm run build
```

2) Start the API

Set env vars (recommended: copy `api/.env.example` to `api/.env` and fill it in):

- `GEMINI_API_KEY` (required for embeddings, search, reindex, and updating embedded fields)
- `VEXI_VECTOR_DIM` (default `768`)
- `LANCEDB_URI` (default `.lancedb`)

```bash
cd ../api
cargo run
```

3) Install and sync the example app schema

```bash
cd ../example-app
npm install
npm run sync
```

4) Run the example app

```bash
cd ../example-app
npm run start
```

## Usage (in your own app)

Create `schema.ts`:

```ts
import { createTable, v } from "vexi";

export const users = createTable({
  name: v.string().embed(),
  bio: v.optional(v.string().embed({ strategy: "recursive-markdown" })),
  isActive: v.boolean(),
});
```

Sync schema:

```bash
npx vexi sync --schema ./schema.ts --url http://localhost:3000
```

Use the client:

```ts
import { createClient } from "vexi";
import { users } from "./schema.js";

const db = createClient({
  schema: { users },
  config: { baseUrl: "http://localhost:3000" },
});

const inserted = await db.users.insert({ name: "Alice", isActive: true });
const updated = await db.users.update(inserted.id, { isActive: false });
const results = await db.users.search("Alice", { topK: 5 });
```

## HTTP API (v1)

- `GET /health`
- `POST /sync`
- `POST /tables/{name}/insert`
- `PATCH /tables/{name}/{id}`
- `POST /tables/{name}/search`
- `POST /tables/{name}/reindex`

Error shape (all non-2xx):

```json
{ "error": { "code": "...", "message": "...", "details": {} } }
```
