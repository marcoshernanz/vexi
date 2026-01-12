import { createClient } from "./client.js";
import { v } from "./fields.js";
import { defineTable, Infer } from "./schema.js";

async function main() {
  // Define a table schema with fields
  const table = defineTable({
    id: v.number(),
    name: v.optional(v.string()),
  });

  // Infer TypeScript type from the table definition
  type TableType = Infer<typeof table>;

  // Initialize the Vexi client
  const db = createClient({ table }, { apiKey: "", baseUrl: "" });

  // Example usage: Insert a record (types are checked)
  await db.table.insert({ id: 1 });

  // Example usage: Search returns typed results
  const results = await db.table.search("query");
}

main();
