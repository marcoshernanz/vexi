import { createClient } from "./client.js";
import { v } from "./fields.js";
import { defineTable, InferType } from "./schema.js";

function main() {
  const table = defineTable({
    id: v.number(),
    name: v.optional(v.string()),
  });

  type TableType = InferType<typeof table>;

  const db = createClient({ table }, { apiKey: "", baseUrl: "" });
}

main();
