# Vexi v1 Build Plan

This is a very thorough, session-sized plan for building Vexi v1: a DX-first RAG database where users define tables in `schema.ts` with a Zod-like DSL, run `npx vexi sync`, and then use a fully type-safe TypeScript client to `insert`, `update`, and `search` while the Rust backend automatically generates embeddings.

This plan assumes the current repo layout:

- `sdk/` TypeScript SDK + CLI
- `api/` Rust backend (Axum) + LanceDB
- `example-app/` minimal consumer

It also reflects the v1 decisions locked in `PROJECT.md`:

- Canonical table constructor: `createTable(...)`
- Optional wrapper API: `v.optional(v.string())`
- Implicit primary key: server-generated `id: string`
- One canonical per-row `vector` built from all embedded fields
- `search(...)` returns scored results: `{ item, score }[]`
- Embedding provider/model selection is primarily server-configured, with optional schema model hints

## V1 Scope (What We Ship)

User-facing, end-to-end:

- `schema.ts` authoring with a Zod-like DSL:
  - `createTable({ ... })`
  - `v.string()`, `v.number()`, `v.boolean()`, `v.optional(...)`
  - `v.string().embed({ model?, strategy? })`
- `npx vexi sync`
  - Reads `schema.ts`
  - Pushes schema to the Rust API
  - Applies safe migrations (create tables, additive column changes)
- Type-safe client:
  - `db.<table>.insert(data | data[])`
  - `db.<table>.update(id, patch)`
  - `db.<table>.search(query, options?)`
- Automatic embeddings:
  - Generated on insert/update on the server
  - Query embedding on search
- Pluggable embedding provider (v1 includes OpenAI + generic HTTP provider)

Non-goals for v1 (explicitly out of scope):

- Auth/multi-tenant security model
- Complex query language (joins, aggregations)
- Rich schema constraints (min/max, regex, etc.) beyond basic types + optional
- Advanced migrations (type changes, column removal) without explicit tooling
- Distributed deployment / replication

## Definition Of Done (v1)

From a clean checkout, a developer can:

1. Start the API (Rust).
2. Define tables in `example-app/schema.ts` (using `createTable` + `v.*`).
3. Run `npx vexi sync` (or `npm run sync` from `example-app/`).
4. Run `example-app/main.ts`.
5. Observe:
   - inserts return generated `id`s
   - invalid inserts are rejected by the server
   - search returns `{ item, score }[]` with correct types client-side

## Key Technical Decisions (v1)

These guide implementation choices throughout the milestones.

### 1) Single Canonical Vector Per Row

If multiple fields call `.embed()`, the server builds a single combined text:

- Stable ordering: schema column order
- Stable labeling: prefix each field with its name
- Skip missing/empty fields

Example combined text:

```
name:\nAlice\n\n
bio:\nLikes databases.\n\n
```

Then embed that combined text into a single `vector` column.

Why this is best for v1:

- Keeps storage + query model simple
- Avoids multi-vector query semantics early
- Still gives good RAG usefulness when users embed the right fields

### 2) Model/Strategy Consistency Per Table

To keep v1 predictable, enforce at sync time:

- A table resolves to exactly one embedding model (either from schema hints or server default).
- If the schema specifies multiple different `model` hints across embedded fields, sync fails with a clear error.
- Strategy resolution:
  - If any embedded field specifies a non-empty `strategy`, that becomes the table strategy.
  - If multiple different strategies are specified, sync fails.

### 3) Server-Generated `id: string`

- Users do not declare `id` in `schema.ts`.
- API generates an `id` for each inserted row.
- Update identifies rows by `id`.

Recommended implementation: UUID (v4 or v7) or ULID. Pick one and keep it stable.

### 4) Schema Is The Contract (JSON)

E2E safety is achieved by:

- SDK schema objects being serializable into a stable JSON representation
- CLI sending that JSON to the backend
- Backend parsing it, validating writes, and building Arrow schemas from it

The backend must never infer the schema from inserted JSON (remove current inference usage for v1).

## Milestones (Each = One Session)

Milestones are ordered and sized so each can be completed in a single focused session.

0. Baseline + cleanup
1. SDK schema DSL: `createTable`, typing, stable serialization
2. CLI sync: robust schema loading + one-shot sync request
3. API sync: schema registry + safe migrations
4. Embeddings: provider trait + OpenAI + generic HTTP provider
5. Insert: validation + implicit id + embeddings + LanceDB write
6. Search: query embedding + vector search + scored results
7. Update: patch by id + re-embedding + persistence semantics
8. Optional: recursive-markdown chunking + chunk index
9. Reindex + migration ergonomics
10. DX polish: docs, errors, example-app, packaging

---

## Milestone 0 - Baseline + Remove Unhelpful Pieces

Goal:

- Establish a passing baseline build for `sdk/` and `api/`.
- Identify and remove/stop depending on code paths that conflict with v1 (notably schema inference on insert).

Work items:

- SDK:
  - Ensure `cd sdk && npm install && npm run lint && npm run build` passes.
- API:
  - Ensure `cd api && cargo build` passes.
  - Ensure `cargo run` starts (today it requires `OPENAI_API_KEY`; keep for now).
- Example app:
  - Ensure `example-app` can run with current code (even if `search` is stubbed).
- Decide what we remove later (do not do large refactors yet):
  - `api/src/utils.rs` schema inference should not be used for v1 insert (schema must come from sync registry).
  - `CreateTableRequest.embedding` shape is too limited (single source field) and will be replaced.

Acceptance criteria:

- `sdk` builds + lints.
- `api` builds.
- Plan of record for what will be deleted/rewired is documented (this plan).

---

## Milestone 1 - SDK Schema DSL v1 (createTable + Types + Serialization)

Goal:

- Public API is `createTable(...)` and `v.*` remains Zod-like.
- Tables are identifiable at runtime (so CLI can reliably extract them).
- Types are excellent:
  - insert input types match required/optional fields
  - row output types include implicit `id: string`
  - search returns `{ item, score }[]` typed properly

Work items:

- Introduce a `Table` runtime wrapper in `sdk/src/schema.ts`.
  - `createTable(columns)` returns `new Table(columns)`.
  - `Table` should include `isVexiTable = true` for CLI detection.
  - `Table#toJSON()` returns a stable JSON format (include a schema version).
- Keep `v.optional(v.string())` as-is.
  - Make sure `OptionalField` serializes embedding config correctly.
- Define the SDK type surface (all as `type`, not `interface`):
  - `type Columns = Record<string, Field<unknown>>`
  - `type Row<TTable> = Prettify<{ id: string } & Infer<TTable["columns"]>>`
  - `type InsertInput<TTable> = Infer<TTable["columns"]>`
  - `type UpdatePatch<TTable> = Partial<Infer<TTable["columns"]>>`
  - `type SearchResult<TTable> = { item: Row<TTable>; score: number }`
- Update exports in `sdk/src/index.ts`:
  - Export `createTable` (and optionally keep `defineTable` as deprecated alias for one iteration).
  - Export helper types (`Row`, `InsertInput`, etc.) if they improve DX.
- Update `example-app/schema.ts` to use `createTable`.
- Update `example-app/main.ts` to use the updated `createClient` API types.

Acceptance criteria:

- `example-app/schema.ts` compiles.
- Type safety demo works:
  - wrong types in insert payload produce TS errors
  - search results are typed as `{ item, score }[]` and `item.id` exists

---

## Milestone 2 - CLI Sync v1 (One Shot, Better Detection, Better Output)

Goal:

- `npx vexi sync` reliably loads `schema.ts`, extracts only tables, and posts them in a single request.
- CLI supports config flags so users do not have to edit code to change base URL.

Work items:

- Update `sdk/src/cli.ts`:
  - Extract tables by checking `value && typeof value === "object" && "isVexiTable" in value`.
  - Prefer a one-shot request: `POST /sync` with `{ tables: { [name]: tableJson } }`.
  - Add CLI options:
    - `--schema ./schema.ts` (default `schema.ts` in cwd)
    - `--url http://localhost:3000` (default)
    - `--api-key ...` (optional, v1 can ignore server-side)
    - `--json` output (machine readable)
  - Improve output:
    - show created/migrated tables
    - show errors per table with clear reasons (e.g. conflicting embedding models)

API request/response (v1 draft):

```json
// request
{
  "tables": {
    "users": {
      "version": 1,
      "columns": {
        "name": {"kind": "string", "isOptional": false, "embedding": {"model": "...", "strategy": "..."}},
        "bio":  {"kind": "string", "isOptional": true,  "embedding": {"model": "..."}},
        "isActive": {"kind": "boolean", "isOptional": false}
      }
    }
  }
}
```

```json
// response
{
  "ok": true,
  "actions": [
    {"table": "users", "action": "created"},
    {"table": "products", "action": "migrated", "details": {"addedColumns": ["tags"]}}
  ],
  "warnings": [
    {"table": "users", "warning": "embeddingConfigChanged", "details": {"requiresReindex": true}}
  ]
}
```

Acceptance criteria:

- Running sync from `example-app/` posts one request.
- CLI output is understandable and stable.

---

## Milestone 3 - API Sync v1 (Schema Registry + Safe Migrations)

Goal:

- Backend has a real schema registry.
- `POST /sync` creates tables and performs safe migrations.
- Sync errors are actionable (tell the user what to change).

Work items:

- Define Rust structs for schema JSON in `api/src/models.rs`:
  - `TableSpec` (version + columns)
  - `ColumnSpec` (kind, is_optional, embedding?)
  - `EmbeddingSpec` (model?, strategy?)
- Implement parsing + validation:
  - Unknown `kind` => sync error
  - Embedding only allowed on `string` => sync error
  - Resolve per-table embedding model + strategy:
    - enforce consistency rules from "Key Technical Decisions"
- Store schema registry data:
  - Replace current `_vexi_metadata` layout with something v1-ready.
  - Recommended metadata table columns:
    - `table_name: Utf8 (non-null)`
    - `schema_json: Utf8 (non-null)`
    - `resolved_embedding_json: Utf8 (nullable)` (resolved model/strategy + embedded field list)
    - `schema_version: Int64` (monotonic)
    - `updated_at: Utf8` or `Int64` (optional)
- Implement `POST /sync` handler in `api/src/handlers.rs`:
  - Ensure metadata table exists
  - For each table:
    - if table does not exist: create with Arrow schema
    - if exists: compare new columns to stored schema
      - allow only additive columns (v1)
      - if destructive change detected: return error (include diff)
    - persist new schema_json + resolved embedding config
  - Respond with actions + warnings

Arrow schema mapping (v1):

- Implicit `id` column:
  - `id: Utf8, nullable = false`
- User columns:
  - `string` -> `Utf8`
  - `number` -> `Float64`
  - `boolean` -> `Boolean`
  - nullable = column.isOptional
- Vector column:
  - if table has any embedded fields: add `vector: List<Float32>, nullable = true` (or non-null if you prefer strict)

Notes on LanceDB capabilities (spike within this milestone):

- Confirm how to:
  - create empty table with schema
  - add columns / alter schema (if supported)
  - if alter is not supported, plan a copy-on-migrate strategy for additive columns (new table + copy + swap)

Acceptance criteria:

- `POST /sync` creates tables before insert.
- Sync rejects conflicting embedding model hints.
- Stored metadata can be read to reconstruct table schema.

---

## Milestone 4 - Embeddings v1 (Provider Trait + OpenAI + HTTP)

Goal:

- Backend supports multiple embedding providers behind a single abstraction.
- Provider selection is server-configured, with schema-level model hints.

Work items:

- Refactor `api/src/embeddings.rs` into:
  - `trait EmbeddingProvider { async fn embed(&self, model: &str, inputs: &[String]) -> Result<Vec<Vec<f32>>, Error>; }`
  - `OpenAiProvider` implementation
  - `HttpProvider` implementation
- Configuration (load once at startup, store in `AppState`):
  - `VEXI_EMBED_PROVIDER=openai|http`
  - OpenAI:
    - `VEXI_OPENAI_API_KEY` (fallback to `OPENAI_API_KEY` for backward compatibility)
    - `VEXI_OPENAI_BASE_URL` optional
  - HTTP provider:
    - `VEXI_EMBEDDINGS_URL`
    - optional headers via `VEXI_EMBEDDINGS_HEADERS_JSON`
- Standardize request/response shape for HTTP provider:
  - Request: `{ "model": "...", "input": ["..."] }`
  - Response: `{ "data": [{"embedding": [0.1, ...]}] }` (match OpenAI-ish shape)
- Add robust behavior:
  - batch size limit
  - retries on transient errors
  - clear error messages that bubble to HTTP responses

Acceptance criteria:

- OpenAI provider still works.
- HTTP provider can be tested with a stub endpoint.
- Embedding errors return structured 5xx with a readable message.

---

## Milestone 5 - Insert v1 (Validation + ID + Embeddings + Write)

Goal:

- `insert` is fully functional end-to-end.
- Server validates payloads using synced schema.
- IDs are generated server-side.
- Embeddings are computed automatically.

Work items:

- Replace current insert flow in `api/src/handlers.rs`:
  - Remove schema inference (`api/src/utils.rs`) from the critical path.
  - Load table schema + resolved embedding config from metadata.
  - Validate incoming JSON:
    - reject unknown keys (or strip; pick one behavior and document)
    - ensure required fields present
    - ensure types match (`string`, `number`, `boolean`)
    - coerce? (v1 recommendation: no coercion, strict)
  - Generate `id` for each record.
  - Build combined text from embedded fields.
  - Call embedding provider (batch).
  - Attach `vector` to record.
  - Convert to Arrow `RecordBatch` using the Arrow schema derived from table schema.
  - Insert into LanceDB.
- Update API response shape:
  - v1 recommendation: return inserted rows (at least `id`s):
    - `[{ id: "..." }, ...]`
  - This improves DX and makes update flows easier.
- Update `sdk/src/client.ts`:
  - Fix `insert` typing to be per-table (current code uses `Infer<DB[keyof DB]>`, which is wrong).
  - Have `insert` return `Row<T>[]` or `{ id: string }[]` consistently.

Acceptance criteria:

- Insert rejects invalid shapes even if client bypasses TS.
- Insert returns generated ids.
- Insert writes include `vector` when embeddings configured.

---

## Milestone 6 - Search v1 (Query Embedding + Vector Search + Scored Results)

Goal:

- `search` is functional end-to-end.
- Results return `{ item, score }[]`.

Work items:

- Add API endpoint in `api/src/handlers.rs`:
  - `POST /tables/:name/search`
  - Request: `{ "query": "...", "topK": 10 }`
  - Response: `{ "results": [{ "score": 0.12, "item": { ...row... } }] }`
- Server search implementation:
  - Load resolved embedding config for table.
  - Embed query with resolved model.
  - Use LanceDB vector search API to search nearest neighbors on `vector`.
  - Select and return full rows + score.
  - Decide a default `topK`.
  - If table has no embeddings configured: return 400 with a clear error.
- SDK client:
  - Implement `search(query, { topK? })` and type it as `Promise<Array<{ item: Row; score: number }>>`.

Acceptance criteria:

- Search returns scored results.
- Example-app can insert + search.

---

## Milestone 7 - Update v1 (Patch By ID + Re-Embed)

Goal:

- Users can update by implicit `id`.
- If embedded fields change, vectors are recomputed.

Work items:

- Decide update API shape (pick one and standardize):
  - Option A: `PATCH /tables/:name/:id` with JSON patch body
  - Option B: `POST /tables/:name/update` with `{ id, patch }`
  - v1 recommendation: Option A (REST-like, simple)
- Implement update persistence in LanceDB:
  - Spike: confirm LanceDB Rust API for upsert/merge/delete.
  - Preferred: merge/UPSERT keyed by `id`.
  - Fallback: delete existing row by filter, then insert new full row.
- Update flow:
  - Validate patch keys and types.
  - Fetch existing row (required to recompute combined text and preserve untouched fields).
  - Apply patch.
  - Recompute `vector` (and chunks if chunking is in v1).
  - Persist.
  - Return updated row.
- SDK:
  - Add `update(id, patch)` and type `patch` as `Partial<InsertInput<T>>`.
  - Return updated `Row<T>`.

Acceptance criteria:

- Updating a non-existent id returns 404.
- Updating embedded fields changes `vector`.
- Updating non-embedded fields does not require embedding call.

---

## Milestone 8 (Optional For v1) - Recursive Markdown Chunking

Goal:

- Support `strategy: "recursive-markdown"` in a way that materially improves RAG search quality.

Design (v1-friendly):

- Base table keeps canonical row and optional row-level `vector`.
- Chunk index table per base table: `_vexi_chunks_<table>`
  - `chunk_id: Utf8 (non-null)`
  - `parent_id: Utf8 (non-null)`
  - `chunk_text: Utf8 (non-null)`
  - `vector: List<Float32>`
  - `ordinal: Int64` (optional)
  - `source_fields: Utf8` (optional JSON)

Insert/update behavior when chunking enabled:

- Create chunks from the combined text.
- Embed each chunk.
- Write chunk rows into the chunk table.
- Search uses chunk table vector search.
- Collapse chunk hits into parent rows:
  - group by `parent_id`
  - pick best score per parent
  - return parent row as `item`

Work items:

- Implement a minimal markdown chunker in Rust:
  - split by headings and paragraph boundaries
  - enforce max chunk size by characters (v1) and keep overlap
- Add chunk table lifecycle:
  - created during sync if strategy is recursive-markdown
  - updated/rebuilt on update
- Update search handler:
  - if chunking enabled, search chunk table and map to parent ids

Acceptance criteria:

- With chunking enabled, search can find relevant rows even when the relevant text is deep in a long field.

---

## Milestone 9 - Reindex + Migration Ergonomics

Goal:

- Schema sync detects when embeddings need backfill.
- Provide a safe, explicit reindex path.

Work items:

- On sync, detect embedding config changes:
  - embedded field set changed
  - model changed
  - strategy changed
- Decide behavior:
  - v1 recommendation: sync succeeds but returns warning `requiresReindex`.
- Add CLI command:
  - `vexi reindex [table]` (or `vexi sync --reindex`)
- Implement API endpoint:
  - `POST /tables/:name/reindex`
  - Iterates rows, recomputes vectors/chunks, writes back.

Acceptance criteria:

- Changing embedding model triggers reindex warning.
- Reindex recomputes vectors.

---

## Milestone 10 - DX Polish (Docs, Errors, Example App, Packaging)

Goal:

- The experience is "one command to sync, then insert/search".
- Errors are helpful.
- Example app demonstrates the full flow.

Work items:

- Documentation:
  - Ensure `README.md` and `PROJECT.md` align with reality.
  - Add a Quickstart that uses `example-app/`.
  - Document environment variables for embeddings.
- SDK ergonomics:
  - Ensure `createClient` typing is correct per-table.
  - Ensure runtime errors include table name + operation.
- API ergonomics:
  - Standardize error response format:
    - `{ "error": { "code": "...", "message": "...", "details": { ... } } }`
  - Add `/health` to confirm server is up.
- Packaging:
  - Ensure `sdk` builds publishable `dist/`.
  - Ensure `bin` works (`npx vexi sync`).

Acceptance criteria:

- New user can follow README and succeed without reading source.

---

## Appendix A - Recommended HTTP API Surface (v1)

- `GET /health`
- `POST /sync`
- `POST /tables/:name/insert`
- `POST /tables/:name/search`
- `PATCH /tables/:name/:id`
- (optional) `POST /tables/:name/reindex`

## Appendix B - Recommended SDK Surface (v1)

```ts
const db = createClient({
  schema: { users, products },
  config: { baseUrl: "http://localhost:3000", apiKey: "dev" },
});

const inserted = await db.users.insert({ name: "Alice", isActive: true });
// inserted: Array<{ id: string; name: string; isActive: boolean; ... }>

const updated = await db.users.update(inserted[0].id, { isActive: false });

const results = await db.users.search("Alice", { topK: 5 });
// results: Array<{ item: { id: string; ... }, score: number }>
```

## Appendix C - What We Likely Delete/Replace From Starting Code

This is not a criticism of the starter code; it is the natural evolution into v1.

- Replace per-table `CreateTableRequest.embedding: Option<EmbeddingConfig>` with a richer, table-level resolved embedding config derived from the schema.
- Stop using `infer_schema_from_json` for inserts (schema must come from sync).
- Replace the CLI table detection heuristic ("all values have isVexiField") with explicit `Table` objects.
- Fix SDK client typing to be per-table (avoid `DB[keyof DB]`).
