# Vexi SDK - Agent Guidelines

This document provides instructions and guidelines for AI agents and developers working on the Vexi SDK.
It covers build commands, code style, conventions, and architectural patterns to ensure consistency.

## 1. Project Overview

- **Language**: TypeScript (ES2022 / NodeNext module resolution)
- **Type**: NPM Package / SDK
- **Package Manager**: npm

## 2. Environment & Commands

Always verify the current environment before executing commands.

### Build

Compile the TypeScript source code to the `dist` directory.

```bash
npm run build
```

_Note: This runs `tsc -p tsconfig.build.json`._

### Linting

Check for code quality and style issues using ESLint.

```bash
npm run lint
```

### Formatting

Format code using Prettier.

```bash
npm run format
```

### Testing

_Currently, no test runner (Jest/Vitest) is configured in `package.json`._
If adding tests:

1. Prefer **Vitest** for compatibility with ESM/Vite-ecosystem.
2. Create test files with `.test.ts` extension alongside source files or in a `test/` directory.
3. Update `package.json` scripts to include `"test": "vitest"`.

## 3. Code Style & Conventions

Adhere strictly to these conventions to maintain the codebase's quality and style.

### 3.1 Formatting

- **Indentation**: 2 spaces.
- **Quotes**: Double quotes for strings (Prettier default).
- **Semi-colons**: Always use semi-colons.
- **Trailing Commas**: ES5 trailing commas (Prettier default).

### 3.2 Imports & Modules

- **ESM Extensions**: You **MUST** include the `.js` extension for local imports.

  ```typescript
  // ✅ Correct
  import { createClient } from "./client.js";
  import { Infer } from "./schema.js";

  // ❌ Incorrect
  import { createClient } from "./client";
  ```

- **Named Exports**: Prefer named exports over default exports for better tree-shaking and clarity.
- **Grouping**: Group standard library imports first, third-party libraries second, and local imports last.

### 3.3 Naming Conventions

- **Variables/Functions**: `camelCase` (e.g., `createClient`, `tableName`).
- **Types/Interfaces**: `PascalCase` (e.g., `VexiClient`, `TableDefinition`).
- **Generics**: Use descriptive names like `Def` or `DB`, or standard `T` for simple utility types.
- **File Names**: `kebab-case` or `camelCase` matching the primary export (currently files like `client.ts`, `schema.ts` use lowercase).

### 3.4 TypeScript & Typing

- **Strict Mode**: The project runs with `"strict": true` and `"noUncheckedIndexedAccess": true`. Handle `undefined` checks explicitly.
- **Type Definitions**:
  - ALWAYS use `type` aliases. Do not use `interface`.
- **Prettify Helper**: Use the `Prettify<T>` helper type when creating complex intersection/mapped types to ensure tooltips in IDEs are readable.
  ```typescript
  export type Prettify<T> = {
    [K in keyof T]: T[K];
  } & {};
  ```
- **Inference**: Leverage TypeScript's inference (`infer`) for schema derivation (see `Infer<T>` in `schema.ts`).

### 3.5 Documentation (JSDoc)

- All exported functions, types, and interfaces **must** have JSDoc comments.
- Explain parameters (`@param`), return values (`@returns`), and template variables (`@template`).
- Focus on the _purpose_ and _usage_ of the component.

```typescript
/**
 * Creates a strongly-typed Vexi client.
 *
 * @param definition The database definition object.
 * @param config Client configuration.
 * @returns A proxy object for database operations.
 */
export function createClient(...) { ... }
```

### 3.6 Error Handling

- Use structured error handling.
- For unimplemented features, use a `TODO` comment explaining what is missing.
- When implementing network calls (e.g., in `client.ts`), wrap `fetch` calls in `try/catch` blocks and throw custom typed errors if possible.

## 4. Architecture & Patterns

### 4.1 Schema Definition

- The SDK uses a "schema-first" approach.
- Tables are defined using `createTable` and fields using `v` (from `fields.js`).
- Types are inferred from these runtime definitions.

### 4.2 Proxy Pattern

- The client (`VexiClient`) uses a JavaScript `Proxy` to dynamically handle property access for table names.
- This allows for a clean API `client.users.insert(...)` without generating code for every table.

### 4.3 Type Safety

- The core value proposition is end-to-end type safety.
- Changes to logic must preserve or enhance type inference for the end user.
- Avoid usage of `any`. Use `unknown` or specific generics where needed.

## 5. Development Workflow

1.  **Read Context**: Before editing, read related files (`schema.ts`, `client.ts`) to understand the generic constraints.
2.  **Edit**: Apply changes ensuring `.js` extensions in imports.
3.  **Verify**:
    - Run `npm run lint` to check for issues.
    - Run `npm run build` to ensure types resolve correctly.

## 6. Project Structure

```
sdk/
├── src/
│   ├── client.ts    # Main client logic and Proxy implementation
│   ├── fields.ts    # Field definitions (string, number, etc.)
│   ├── index.ts     # Public API exports
│   └── schema.ts    # Schema definition helpers and type inference
├── dist/            # Compiled output (Git-ignored)
├── package.json
└── tsconfig.json
```

## 7. AI Agent specific instructions

- **Analysis**: When exploring, use `glob` to find files and `read` to check content.
- **Modifications**: When modifying `package.json`, ensure dependency versions are pinned or use caret ranges consistently.
- **Output**: When creating new files, ensure they are included in `tsconfig.json` (or `src/`).

---

_Generated by opencode on Jan 15 2026_
