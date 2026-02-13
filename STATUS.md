# Vexi Status / Decisions

Last updated: 2026-02-12

## Non-negotiables

- No backward compatibility. We delete legacy endpoints, legacy client fallbacks, and legacy docs.
- Schema registry is the contract. The server validates writes against the synced registry.
- v1 migrations are additive only.

## Current v1 behavior

- `npx vexi sync` -> `POST /sync` with `{ tables: { [name]: TableSpecV1 } }`.
- `POST /tables/{name}/insert`:
  - rejects unknown columns
  - rejects user-supplied `id`
  - server-generates `id: string`
  - if embedding fields exist + `GEMINI_API_KEY` is set, computes a single per-row `vector`
  - writes to LanceDB using Arrow schema derived from the synced spec (no inference)

- `PATCH /tables/{name}/{id}`:
  - validates patch keys/types against the synced registry
  - rejects patching reserved `id` and `vector`
  - fetches the existing row by id, applies patch, validates final row
  - if embedded fields are updated, recomputes embeddings (requires `GEMINI_API_KEY`)
  - persists via LanceDB `merge_insert` (update-only; no insert-on-miss)

- `POST /tables/{name}/reindex`:
  - requires `GEMINI_API_KEY`
  - recomputes embeddings for all rows using the current schema registry embedding config
  - if `strategy: "recursive-markdown"`, rebuilds chunk rows in `_vexi_chunks_<table>`

## Embeddings

- Provider: Gemini API (v1beta)
- Env: `GEMINI_API_KEY`
- Default model when schema provides no hint: `models/text-embedding-004`

## Completed

- `/sync` implemented with `_vexi_schema_registry` (schema JSON + resolved embedding config + version).
- Insert path validates against registry and writes with schema-derived Arrow types.
- CLI sync is v1-only (no legacy fallback).

## Next steps

- Remove remaining legacy/back-compat references in docs/plans (`PLAN.md`, `PROJECT.md`, `README.md`).
- Add search endpoint(s) and SDK search once insert+sync are stable.
- Improve reindex ergonomics (progress output, better scan batching) if needed.

## Search v1 status

- Implemented `POST /tables/{name}/search` (API) and `db.<table>.search()` (SDK).
- Vector search uses LanceDB `nearest_to(...)` and expects a `vector: FixedSizeList<Float32, DIM>` column.
- DIM is configured via `VEXI_VECTOR_DIM` (default 768). Existing tables created before this change may need a fresh `.lancedb` or a migration.

## Chunking v1 status (optional)

- Strategy `recursive-markdown` creates a chunk table `_vexi_chunks_<table>` during sync.
- Inserts/updates embed chunks and search uses the chunk table, then hydrates parent rows.

## Update v1 status

- Implemented `PATCH /tables/{name}/{id}` (API) and `db.<table>.update(id, patch)` (SDK).
