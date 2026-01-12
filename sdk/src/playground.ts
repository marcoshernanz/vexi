import { createClient } from "./client.js";
import { v } from "./fields.js";
import { defineTable, Infer } from "./schema.js";

async function main() {
  const table = defineTable({
    id: v.number(),
    name: v.optional(v.string()),
  });

  type TableType = Infer<typeof table>;

  const db = createClient({ table }, { apiKey: "", baseUrl: "" });

  // TODO: This shouldn't throw a type error
  await db.table.insert({ id: 1 });

  // TODO: results should be of type TableType[]
  const results = await db.table.search("query");
}

main();
