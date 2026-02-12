#!/usr/bin/env node

/**
 * Vexi CLI.
 *
 * This tool is responsible for synchronizing the local database schema definitions
 * (written in TypeScript) with the Vexi API server.
 *
 * Capabilities:
 * - Loads `schema.ts` dynamically using `jiti`.
 * - Validates that exported objects are Vexi Table definitions.
 * - Pushes valid table schemas to the API via HTTP POST.
 */
import { cac } from "cac";
import { createJiti } from "jiti";
import path from "path";
import fs from "fs";

const cli = cac("vexi");

/**
 * Command: sync
 * Usage: npx vexi sync
 *
 * Reads the 'schema.ts' file from the current working directory, extracts
 * table definitions, and sends them to the Vexi server (default: localhost:3000).
 */
cli.command("sync", "Sync schema with the Vexi server").action(async () => {
  console.log("Syncing schema...");

  const schemaPath = path.resolve(process.cwd(), "schema.ts");

  if (!fs.existsSync(schemaPath)) {
    console.error("Error: schema.ts not found in current directory.");
    process.exit(1);
  }

  // Use jiti to load the TypeScript file without compiling it first.
  const jiti = createJiti(process.cwd());
  const mod = await jiti.import(schemaPath);

  // Find all exported values that are Vexi tables.
  const tables: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(mod as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) {
      continue;
    }

    // A table is a `Table` instance (see `sdk/src/schema.ts`).
    if (
      "isVexiTable" in value &&
      (value as { isVexiTable: unknown }).isVexiTable === true
    ) {
      tables[key] = value;
    }
  }

  if (Object.keys(tables).length === 0) {
    console.log("No table definitions found in schema.ts");
    return;
  }

  // Iterate over found tables and push them to the API
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
