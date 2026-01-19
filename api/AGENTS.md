# Agent Instructions (AGENTS.md)

This document contains instructions for AI agents (and human developers) working on the Vexi API codebase. Please follow these guidelines to ensure consistency and maintainability.

## 1. Environment & Commands

### Build & Run

- **Development Server:** `npm run dev` (Runs with `tsx watch`)
- **Production Build:** `npm run build` (Compiles TS to `dist/` using `tsc`)
- **Start Production:** `npm run start` (Runs `dist/index.js`)

### Linting & Formatting

- **Lint:** `npm run lint` (Uses ESLint with strict TypeScript rules)
- **Format:** `npm run format` (Uses Prettier)
- **Fix Lint Issues:** `npx eslint --fix .`

### Testing

_Note: No test runner is currently configured in `package.json`._

- If asked to write tests, prefer using the native Node.js test runner (`node --test`) or a lightweight runner compatible with ESM and TypeScript (like `vitest` or `tsx --test`).
- Ensure tests are placed in a `tests/` directory or alongside source files with `.test.ts` extension.

## 2. Project Structure

- **`src/`**: Source code directory.
  - **`index.ts`**: Entry point. Sets up Fastify server and DB connection.
  - **`schema.ts`**: Logic for converting Vexi schemas to Apache Arrow schemas.
  - **`validator.ts`**: Zod schemas for runtime validation and type inference.
- **`.lancedb/`**: Local database storage (created at runtime).

## 3. Code Style & Conventions

### Imports & Modules

- **ES Modules:** This project is `type: module`.
- **Extensions:** **ALWAYS** include the `.js` extension when importing local files.
  - _Correct:_ `import { something } from "./utils.js";`
  - _Incorrect:_ `import { something } from "./utils";`
- **Named Imports:** Prefer named imports over default exports.

### TypeScript & Types

- **Strictness:** Strict mode is enabled. No implicit `any`.
- **Type Definitions:** Use `type` aliases instead of `interface` (enforced by ESLint rule `@typescript-eslint/consistent-type-definitions`).
- **Validation:** Use **Zod** for all external data validation (API requests, config).
  - Export inferred types from Zod schemas: `export type MyType = z.infer<typeof MySchema>;`

### Naming Conventions

- **Files:** camelCase (e.g., `schema.ts`, `validator.ts`) or kebab-case if necessary.
- **Zod Schemas:** PascalCase (e.g., `FieldSchema`, `CreateTableSchema`).
- **Types:** PascalCase (e.g., `VexiField`).
- **Variables/Functions:** camelCase.

### Error Handling

- **Async/Await:** Use `async/await` for asynchronous operations (DB, File I/O).
- **Fastify Handlers:** Wrap logic in `try/catch` blocks.
  - Return appropriate HTTP status codes (e.g., 404 for not found, 400 for validation errors).
  - Structure error responses consistently: `reply.code(400).send({ error: "Message or object" })`.

### Documentation

- **JSDoc:** Add JSDoc comments to exported functions and complex types.
  - Explain _what_ the function does and _why_.
  - Document parameters (`@param`) and return values (`@returns`).

## 4. Example Pattern

When adding a new API endpoint, follow this pattern found in `src/index.ts`:

```typescript
import { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

// 1. Define Request Schema (if body/params needed)
const MyRequestSchema = z.object({
  id: z.string(),
});

// 2. Define Handler
fastify.post<{ Body: z.infer<typeof MyRequestSchema> }>(
  "/resource",
  async (request, reply) => {
    // 3. Validate
    const result = MyRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: result.error.format() });
    }

    // 4. Execute Logic
    try {
      // ... database operations ...
      return { success: true };
    } catch (error) {
      request.log.error(error); // Log the error
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  },
);
```
