import { db } from "../db/client";
import { SchemaConverter } from "../db/schema-converter";
import { defineSchema, defineTable, v } from "vexi";

// Schema definition matching playground.ts
const table = defineTable({
  stringField: v.string(),
  optionalField: v.string().optional(),
  textField: v.text().embed(),
  optionalTextField: v.text().optional().embed(),
  numberField: v.number(),
  booleanField: v.boolean(),
});

const schema = defineSchema({ table });

async function main() {
  console.log("🔄 Generating SQL from Vexi Schema...");
  const statements = SchemaConverter.toSQL(schema);

  console.log("📦 Applying schema to database...");
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Clean up previous run
    await client.query('DROP TABLE IF EXISTS "table" CASCADE');

    for (const sql of statements) {
      console.log(`Executing: ${sql.substring(0, 50).replace(/\n/g, " ")}...`);
      await client.query(sql);
    }

    await client.query("COMMIT");
    console.log("✅ Database synced successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
  } finally {
    client.release();
    await db.pool.end();
  }
}

main();
