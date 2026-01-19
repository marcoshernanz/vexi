# Vexi

**Vexi** is a lightweight, developer-friendly database toolkit for Node.js. It provides a convention-based workflow to define schemas in TypeScript, automatically sync them to a local Vector DB (LanceDB) via a dedicated API, and interact with your data using a fully type-safe client.

## Core Concepts

*   **Schema-First**: Define your tables in TypeScript.
*   **Auto-Sync**: Push your schema changes to the database with a single CLI command.
*   **Vector-Ready**: Built on top of LanceDB, ready for vector search and standard queries.
*   **Type-Safe**: Use your schema definitions to get instant autocomplete and type checking in your client code.

---

## Getting Started

### 1. Installation

(Coming soon: `npm install vexi`)

For now, ensure you have the `api` and `sdk` folders in your workspace.

### 2. Start the API Server

The Vexi API sits between your application and the database (stored locally in `.lancedb`).

```bash
cd api
npm install
npm run dev
```

The server will start on `http://localhost:3000`.

---

## usage

### 1. Define Your Schema

Create a file named `schema.ts` in the root of your project. This is where you define your data model.

```typescript
import { defineTable, v } from "./sdk/src/index"; // Adjust path to SDK

export const users = defineTable({
  id: v.number(),
  username: v.string(),
  isActive: v.boolean(),
  bio: v.optional(v.string())
});

export const products = defineTable({
  sku: v.string(),
  price: v.number(),
  inStock: v.boolean()
});
```

**Supported Fields:**
*   `v.string()`
*   `v.number()`
*   `v.boolean()`
*   `v.optional(...)`

### 2. Sync Schema to Database

Once your `schema.ts` is ready, run the sync command. This reads your TypeScript file, validates strict types, and creates the corresponding tables in the LanceDB database.

```bash
# Run from your project root
npx vexi sync
```

*Note: If running locally during development, you might use:*
```bash
node sdk/dist/cli.js sync
```

You should see output indicating that tables were successfully created.

### 3. Initialize the Client

Use the `createClient` function to interact with your data. Pass in your schema definitions to unlock full type safety.

**`main.ts`**

```typescript
import { createClient } from "./sdk/src/client";
import { users, products } from "./schema"; // Import your table definitions

// Initialize with your tables
const db = createClient(
  { users, products }, 
  {
    baseUrl: "http://localhost:3000",
    apiKey: "dev" // Placeholder for future auth
  }
);

async function run() {
  // 1. Insert Data
  // TypeScript will enforce that 'sku' is a string and 'price' is a number!
  await db.products.insert({
    sku: "ABC-123",
    price: 99.99,
    inStock: true
  });

  // 2. Search Data
  const results = await db.products.search("ABC-123");
  console.log("Found products:", results);
}

run();
```

---

## API Reference

### `defineTable(fields)`
Helper to create strict table definitions.
*   `fields`: An object where keys are column names and values are Vexi field types.

### `v` (Field Builder)
*   `v.string()`: UTF-8 String.
*   `v.number()`: Double precision Float (Apache Arrow Float64).
*   `v.boolean()`: Boolean value.
*   `v.optional(T)`: Marks a field as nullable/optional.

### CLI Commands
*   `vexi sync`: Looks for `schema.ts` in the current directory and pushes changes to the API.

---

## Architecture

*   **API**: Fastify server handling HTTP requests and managing the LanceDB instance.
*   **SDK**: TypeScript library providing the `v` builder, types, and the `vexi` CLI.
*   **Database**: LanceDB (embedded vector database), storing data in `.lancedb/`.
