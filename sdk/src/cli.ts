#!/usr/bin/env node
import { cac } from "cac";
import { createJiti } from "jiti";
import path from "path";
import fs from "fs";

const cli = cac("vexi");

cli.command("sync", "Sync schema with the Vexi server").action(async () => {
  console.log("Syncing schema...");

  const schemaPath = path.resolve(process.cwd(), "schema.ts");

  if (!fs.existsSync(schemaPath)) {
    console.error("Error: schema.ts not found in current directory.");
    process.exit(1);
  }

  const jiti = createJiti(process.cwd());
  const mod = await jiti.import(schemaPath);

  // Find all exported objects that look like tables (keys are fields)
  const tables: Record<string, any> = {};

  for (const [key, value] of Object.entries(mod as any)) {
    if (typeof value === "object" && value !== null) {
      // Check if values are Fields (simple heuristic: isVexiField property)
      const isTable = Object.values(value as any).every(
        (v: any) => v && v.isVexiField,
      );
      if (isTable) {
        tables[key] = value;
      }
    }
  }

  if (Object.keys(tables).length === 0) {
    console.log("No table definitions found in schema.ts");
    return;
  }

  for (const [name, schema] of Object.entries(tables)) {
    console.log(`Pushing table: ${name}`);
    try {
      const response = await fetch("http://localhost:3000/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, schema }),
      });

      if (!response.ok) {
        console.error(`Failed to sync ${name}: ${await response.text()}`);
      } else {
        const res = await response.json();
        console.log(`Success: ${name}`, res);
      }
    } catch (err) {
      console.error(`Network error syncing ${name}:`, err);
    }
  }
});

cli.help();
cli.parse();
