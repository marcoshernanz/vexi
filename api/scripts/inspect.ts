import * as lancedb from "@lancedb/lancedb";
import * as path from "path";
import * as fs from "fs";

async function main() {
  // Assume we are running from the 'api' root directory
  const dbDir = path.join(process.cwd(), ".lancedb");

  if (!fs.existsSync(dbDir)) {
    console.error(`Database directory not found at: ${dbDir}`);
    console.error("Make sure you run this script from the 'api' directory.");
    process.exit(1);
  }

  console.log(`📂 Connecting to LanceDB at: ${dbDir}`);
  const db = await lancedb.connect(dbDir);

  const tableNames = await db.tableNames();
  console.log(`\nFound ${String(tableNames.length)} tables:`, tableNames);

  for (const name of tableNames) {
    console.log(`\n---------------------------------------------------`);
    console.log(`📋 Table: ${name}`);

    try {
      const table = await db.openTable(name);
      const count = await table.countRows();
      console.log(`   Rows: ${String(count)}`);

      console.log(`   First 5 records:`);
      const records = await table.query().limit(5).toArray();
      console.table(records);
    } catch (err) {
      console.error(`   Error reading table '${name}':`, err);
    }
  }
  console.log(`\n---------------------------------------------------`);
}

main().catch(console.error);
