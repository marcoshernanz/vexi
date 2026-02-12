# Agent Instructions (AGENTS.md)

This document contains instructions for AI agents operating in the Vexi repository.
Vexi is a monorepo containing an API, an SDK, and examples.

## 1. Project Structure

- **`api/`**: The Vexi API server (Fastify, Zod, LanceDB).
- **`sdk/`**: The Vexi TypeScript SDK (Proxy pattern, Type inference).
- **`example-app/`**: Usage examples.

## 2. Build & Test Commands

**Note:** Always run commands from the specific package directory (e.g., `api/` or `sdk/`) unless specified otherwise.

### Build & Run
- **Build**: `npm run build` (Compiles TS to `dist/`)
- **Dev Server (API)**: `npm run dev`
- **Start (API)**: `npm run start`

### Linting & Formatting
- **Lint**: `npm run lint` (ESLint with strict type checking)
- **Format**: `npm run format` (Prettier)
- **Fix**: `npm run lint -- --fix`

### Testing
*No test runner is globally configured yet.*
- If asked to run/write tests:
  - Check `package.json` first to see if one has been added.
  - Recommend/Use **Vitest** or `node --test` compatible with ESM.
  - **Run a single test file (example):**
    - `npx vitest run path/to/file.test.ts`
    - `node --test path/to/file.test.ts` (if using native runner)

## 3. Code Style & Conventions

**Strict adherence to these rules is required.**

### Imports & Modules
- **ES Modules**: `type: module` is used everywhere.
- **File Extensions**: **MUST** include `.js` extension for local imports.
  - ✅ `import { foo } from "./utils.js";`
  - ❌ `import { foo } from "./utils";`
- **Organization**: Group imports: Standard Lib -> Third Party -> Local.

### TypeScript & Types
- **Strict Mode**: `strict: true`, `noUncheckedIndexedAccess: true`.
- **Type Definitions**: **ALWAYS** use `type` aliases. Do not use `interface`.
  - Enforced by ESLint: `@typescript-eslint/consistent-type-definitions: ["error", "type"]`.
- **No `any`**: Avoid `any`. Use `unknown` or generics.
- **Type Utils**: Use `Prettify<T>` helper for complex object types to improve IDE readability.

### Naming
- **Files**: `camelCase.ts` (e.g., `schema.ts`, `client.ts`).
- **Variables/Functions**: `camelCase`.
- **Types/Schemas**: `PascalCase` (e.g., `UserSchema`, `VexiClient`).
- **Private**: `_prefix` for unused variables (handled by linter).

### Formatting
- **Indentation**: 2 spaces.
- **Quotes**: Double quotes.
- **Semi-colons**: Always.
- **Trailing Commas**: ES5.

## 4. Specific Guidelines

### API (`api/`)
- **Validation**: Use **Zod** for all I/O validation.
- **Fastify**: Use `try/catch` in handlers. Return structured errors.
- **Pattern**: Request Schema -> Validate -> Logic -> Response.
- **Async**: Use `async/await` for all I/O.

### SDK (`sdk/`)
- **Schema-First**: Types are inferred from runtime definitions (`createTable`).
- **Proxy Pattern**: Used in `VexiClient` for dynamic table access.
- **Compatibility**: Ensure changes work with `NodeNext` module resolution.

## 5. Agent Workflow

1. **Context First**:
   - Before making changes, read `package.json` and `tsconfig.json` in the active directory to understand dependencies and settings.
   - Use `glob` to find relevant files and `grep` to search for usage patterns.

2. **Implementation**:
   - Write code that mimics existing patterns.
   - **Crucial**: Remember the `.js` extension in imports.
   - **Crucial**: Use `type` not `interface`.

3. **Verification**:
   - Before confirming a task, run verification commands:
     ```bash
     npm run lint
     npm run build
     ```
   - Fix any linting errors automatically where possible (`npm run lint -- --fix`).

4. **Dependencies**:
   - Pin versions in `package.json` (avoid loose ranges if possible).
   - Do not assume global tools are installed; use `npx` or `npm run`.

5. **Error Handling**:
   - Wrap "dangerous" code (IO, Network) in `try/catch`.
   - Provide clear error messages.
