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
- Consider reindex workflow for embedding config changes.
