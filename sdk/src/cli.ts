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

type SyncCommandOptions = {
  /**
   * Path to the schema file (relative to cwd or absolute).
   */
  schema?: string;
  /**
   * Vexi API base URL.
   */
  url?: string;
  /**
   * Optional API key.
   */
  apiKey?: string;
  /**
   * Output machine-readable JSON.
   */
  json?: boolean;
};

type ReindexCommandOptions = {
  /**
   * Path to the schema file (relative to cwd or absolute).
   *
   * Only required when reindexing all tables.
   */
  schema?: string;
  /**
   * Vexi API base URL.
   */
  url?: string;
  /**
   * Optional API key.
   */
  apiKey?: string;
  /**
   * Output machine-readable JSON.
   */
  json?: boolean;
  /**
   * Optional embedding batch size to use on the server.
   */
  embedBatchSize?: number;
};

type SyncPayload = {
  tables: Record<string, unknown>;
};

type SyncRunSummary = {
  ok: boolean;
  schemaPath: string;
  url: string;
  tables: string[];
  response?: unknown;
  errors?: {
    table?: string;
    message: string;
  }[];
};

type ReindexRunSummary = {
  ok: boolean;
  schemaPath?: string;
  url: string;
  tables: string[];
  results?: unknown;
  errors?: {
    table?: string;
    message: string;
  }[];
};

function resolveBaseUrl(url: string): string {
  // `new URL(...)` requires a protocol, so help the user by failing loudly.
  // We intentionally do not auto-prepend http:// because that can hide mistakes.
  // (The default already includes a protocol.)
  void new URL(url);
  return url.replace(/\/+$/, "");
}

function endpoint(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${baseUrl}/`).toString();
}

function getAuthHeaders(apiKey?: string): Record<string, string> {
  if (!apiKey) {
    return {};
  }
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

function isVexiTable(value: unknown): value is { toJSON(): unknown } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "isVexiTable" in value &&
    (value as { isVexiTable: unknown }).isVexiTable === true
  );
}

async function loadSchemaModule(schemaPath: string): Promise<unknown> {
  // Use jiti to load the TypeScript file without compiling it first.
  const jiti = createJiti(process.cwd());
  return await jiti.import(schemaPath);
}

function extractTables(mod: unknown): Record<string, unknown> {
  const tables: Record<string, unknown> = {};
  const moduleRecord = mod as Record<string, unknown>;

  for (const [key, value] of Object.entries(moduleRecord)) {
    if (!isVexiTable(value)) {
      continue;
    }
    tables[key] = value;
  }

  // Optional DX: support `export default { users, products }`.
  const maybeDefault = moduleRecord.default;
  if (typeof maybeDefault === "object" && maybeDefault !== null) {
    for (const [key, value] of Object.entries(
      maybeDefault as Record<string, unknown>,
    )) {
      if (!isVexiTable(value)) {
        continue;
      }
      // Don't overwrite named exports.
      if (!(key in tables)) {
        tables[key] = value;
      }
    }
  }

  return tables;
}

cli
  .command("sync", "Sync schema with the Vexi server")
  .option("--schema <path>", "Path to schema file", {
    default: "schema.ts",
  })
  .option("--url <url>", "Vexi API base URL", {
    default: "http://localhost:3000",
  })
  .option("--api-key <key>", "API key")
  .option("--json", "Output machine-readable JSON")
  .action(async (options: SyncCommandOptions) => {
    if (!options.json) {
      console.log("Syncing schema...");
    }
    const schemaPath = path.resolve(process.cwd(), options.schema ?? "schema.ts");
    const baseUrl = resolveBaseUrl(options.url ?? "http://localhost:3000");

    if (!fs.existsSync(schemaPath)) {
      const msg = `Error: schema file not found: ${schemaPath}`;
      if (options.json) {
        const summary: SyncRunSummary = {
          ok: false,
          schemaPath,
          url: baseUrl,
          tables: [],
          errors: [{ message: msg }],
        };
        console.log(JSON.stringify(summary, null, 2));
        process.exitCode = 1;
        return;
      }
      console.error(msg);
      process.exitCode = 1;
      return;
    }

    if (!options.json) {
      console.log(`Schema: ${schemaPath}`);
      console.log(`Target: ${baseUrl}`);
    }

    let mod: unknown;
    try {
      mod = await loadSchemaModule(schemaPath);
    } catch (err) {
      const message =
        err instanceof Error
          ? `Failed to load schema module: ${err.message}`
          : "Failed to load schema module.";
      if (options.json) {
        const summary: SyncRunSummary = {
          ok: false,
          schemaPath,
          url: baseUrl,
          tables: [],
          errors: [{ message }],
        };
        console.log(JSON.stringify(summary, null, 2));
        process.exitCode = 1;
        return;
      }
      console.error(message);
      process.exitCode = 1;
      return;
    }

    const tables = extractTables(mod);
    const tableNames = Object.keys(tables);

    if (tableNames.length === 0) {
      const msg =
        "No table definitions found. Export tables as `export const users = createTable({ ... })`.";
      if (options.json) {
        const summary: SyncRunSummary = {
          ok: true,
          schemaPath,
          url: baseUrl,
          tables: [],
          response: { ok: true, actions: [] },
        };
        console.log(JSON.stringify(summary, null, 2));
        return;
      }
      console.log(msg);
      return;
    }

    const payload: SyncPayload = {
      tables,
    };

    const syncUrl = endpoint(baseUrl, "/sync");
    let responseJson: unknown;
    const errors: SyncRunSummary["errors"] = [];

    try {
      const response = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(options.apiKey),
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404) {
        throw new Error(
          "Sync failed: server does not support POST /sync. This CLI is v1-only and does not support legacy endpoints.",
        );
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Sync failed: ${String(response.status)} ${response.statusText}: ${text}`,
        );
      }

      responseJson = await response.json().catch(() => undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed.";
      errors.push({ message });
    }

    const ok = errors.length === 0;

    const summary: SyncRunSummary = {
      ok,
      schemaPath,
      url: baseUrl,
      tables: tableNames,
      response: responseJson,
      ...(errors.length > 0 ? { errors } : {}),
    };

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`Synced ${String(tableNames.length)} table(s).`);
    }

    if (!ok) {
      process.exitCode = 1;
    }
  });

cli
  .command("reindex [table]", "Reindex embeddings for a table")
  .option("--schema <path>", "Path to schema file", {
    default: "schema.ts",
  })
  .option("--url <url>", "Vexi API base URL", {
    default: "http://localhost:3000",
  })
  .option("--api-key <key>", "API key")
  .option(
    "--embed-batch-size <n>",
    "Embedding batch size (server hint)",
    {
      default: undefined,
    },
  )
  .option("--json", "Output machine-readable JSON")
  .action(async (table: string | undefined, options: ReindexCommandOptions) => {
    const baseUrl = resolveBaseUrl(options.url ?? "http://localhost:3000");
    const schemaPath = path.resolve(process.cwd(), options.schema ?? "schema.ts");

    let tablesToReindex: string[] = [];
    let resolvedSchemaPath: string | undefined = undefined;

    // If a table name is provided, allow running without a schema file.
    if (typeof table === "string" && table.trim() !== "") {
      tablesToReindex = [table.trim()];
      if (fs.existsSync(schemaPath)) {
        resolvedSchemaPath = schemaPath;
      }
    } else {
      // No table arg: require schema to discover all tables.
      if (!fs.existsSync(schemaPath)) {
        const msg = `Error: schema file not found: ${schemaPath}`;
        if (options.json) {
          const summary: ReindexRunSummary = {
            ok: false,
            schemaPath,
            url: baseUrl,
            tables: [],
            errors: [{ message: msg }],
          };
          console.log(JSON.stringify(summary, null, 2));
          process.exitCode = 1;
          return;
        }
        console.error(msg);
        process.exitCode = 1;
        return;
      }

      resolvedSchemaPath = schemaPath;
      let mod: unknown;
      try {
        mod = await loadSchemaModule(schemaPath);
      } catch (err) {
        const message =
          err instanceof Error
            ? `Failed to load schema module: ${err.message}`
            : "Failed to load schema module.";
        if (options.json) {
          const summary: ReindexRunSummary = {
            ok: false,
            schemaPath,
            url: baseUrl,
            tables: [],
            errors: [{ message }],
          };
          console.log(JSON.stringify(summary, null, 2));
          process.exitCode = 1;
          return;
        }
        console.error(message);
        process.exitCode = 1;
        return;
      }

      const tables = extractTables(mod);
      tablesToReindex = Object.keys(tables);
      if (tablesToReindex.length === 0) {
        const msg =
          "No table definitions found. Export tables as `export const users = createTable({ ... })`.";
        if (options.json) {
          const summary: ReindexRunSummary = {
            ok: true,
            schemaPath,
            url: baseUrl,
            tables: [],
            results: [],
          };
          console.log(JSON.stringify(summary, null, 2));
          return;
        }
        console.log(msg);
        return;
      }
    }

    if (!options.json) {
      console.log(`Target: ${baseUrl}`);
      if (resolvedSchemaPath) {
        console.log(`Schema: ${resolvedSchemaPath}`);
      }
      console.log(`Reindexing ${String(tablesToReindex.length)} table(s)...`);
    }

    const errors: ReindexRunSummary["errors"] = [];
    const results: unknown[] = [];

    for (const tableName of tablesToReindex) {
      const url = endpoint(baseUrl, `/tables/${tableName}/reindex`);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(options.apiKey),
          },
          body: JSON.stringify({
            embedBatchSize: options.embedBatchSize,
          }),
        });

        if (response.status === 404) {
          throw new Error(
            "Reindex failed: server does not support POST /tables/{name}/reindex.",
          );
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Reindex failed: ${String(response.status)} ${response.statusText}: ${text}`,
          );
        }

        const json = await response.json().catch(() => undefined);
        results.push(json);

        if (!options.json) {
          console.log(`Reindexed "${tableName}".`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Reindex failed.";
        errors.push({ table: tableName, message });
        if (!options.json) {
          console.error(`Failed to reindex "${tableName}": ${message}`);
        }
      }
    }

    const ok = errors.length === 0;
    const summary: ReindexRunSummary = {
      ok,
      ...(resolvedSchemaPath ? { schemaPath: resolvedSchemaPath } : {}),
      url: baseUrl,
      tables: tablesToReindex,
      results,
      ...(errors.length > 0 ? { errors } : {}),
    };

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`Done. ${ok ? "OK" : "Errors"}.`);
    }

    if (!ok) {
      process.exitCode = 1;
    }
  });

cli.help();
cli.parse();
