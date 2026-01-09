import type { WireEmbedConfig } from "./config";
import type { VType } from "./fields";
import type { InferDoc, VSchema, VTable } from "./schema";
import { VexiConfigError, VexiUnknownTableError } from "./errors";
import { joinUrl, postJson, type FetchLike } from "./internal/http";

// --- Public Types ---

export type SearchResult<T extends VTable<any>> = InferDoc<T> & {
  // Future-proofing: these are optional while the API evolves.
  _score?: number; // cosine similarity (0..1)
  _match_text?: string; // the specific chunk that matched
  _id?: string; // document id (when the API returns it)
};

export interface RequestOptions {
  /** Abort/cancel the underlying fetch request. */
  signal?: AbortSignal;

  /** Per-request headers (merged on top of client headers). */
  headers?: Record<string, string>;
}

export interface SearchOptions extends RequestOptions {
  limit?: number; // Defaults to 10
}

export interface InsertOptions extends RequestOptions {}

export interface InsertResult {
  id: string;
  status: "queued" | (string & {});
}

export interface TableClient<T extends VTable<any>> {
  insert(data: InferDoc<T>, options?: InsertOptions): Promise<InsertResult>;
  insertMany(
    items: ReadonlyArray<InferDoc<T>>,
    options?: InsertOptions
  ): Promise<Array<InsertResult>>;
  search(
    query: string,
    options?: SearchOptions
  ): Promise<Array<SearchResult<T>>>;
}

export type VexiClient<S extends VSchema<any>> = {
  [K in keyof S["tables"]]: TableClient<S["tables"][K]>;
};

export interface ClientConfig<S extends VSchema<any>> {
  schema: S;
  apiKey?: string;
  apiUrl?: string;
  fetch?: FetchLike;
  headers?: Record<string, string>;
}

export type VexiClientHelpers<S extends VSchema<any>> = {
  /** Access a table client by name (useful for dynamic code). */
  $table<K extends keyof S["tables"]>(name: K): TableClient<S["tables"][K]>;

  /** Exposes the schema instance used to create the client. */
  $schema: S;

  /** Resolved API base URL. */
  $url: string;
};

// --- Implementation ---

const RESERVED_CLIENT_KEYS = new Set(["$table", "$schema", "$url"]);

function getGlobalFetch(): FetchLike | undefined {
  return (globalThis as unknown as { fetch?: FetchLike }).fetch;
}

function extractEmbedConfig(tableDef: VTable<any>): WireEmbedConfig | null {
  let found: WireEmbedConfig | null = null;

  for (const [field, fieldType] of Object.entries(tableDef.shape) as Array<
    [string, VType<any>]
  >) {
    const embed = fieldType._getEmbedConfig();
    if (!embed) continue;

    if (found) {
      throw new VexiConfigError(
        `Table has multiple embedded fields ("${found.field}", "${field}"). ` +
          `Only one embedded field is supported by the current API.`
      );
    }

    found = { field, ...embed };
  }

  return found;
}

export function createClient<S extends VSchema<any>>(
  config: ClientConfig<S>
): VexiClient<S> & VexiClientHelpers<S> {
  const apiUrl = config.apiUrl ?? "http://localhost:3000";

  try {
    // Validate early so failures happen at client construction time.
    joinUrl(apiUrl, "/");
  } catch {
    throw new VexiConfigError(`Invalid apiUrl \"${apiUrl}\"`);
  }

  const fetcher = config.fetch ?? getGlobalFetch();
  if (!fetcher) {
    throw new VexiConfigError(
      "No fetch implementation found. Provide ClientConfig.fetch (or use Node 18+/a runtime with global fetch)."
    );
  }

  const headers: Record<string, string> = {
    ...(config.headers ?? {}),
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };

  const tableClients = new Map<string, TableClient<VTable<any>>>();
  const availableTables = Object.keys(config.schema.tables);

  for (const tableName of availableTables) {
    if (RESERVED_CLIENT_KEYS.has(tableName)) {
      throw new VexiConfigError(
        `Table name "${tableName}" is reserved by the client. Please rename the table.`
      );
    }
  }

  const getTableClient = <K extends keyof S["tables"]>(
    tableName: K
  ): TableClient<S["tables"][K]> => {
    const tableNameStr = String(tableName);

    const cached = tableClients.get(tableNameStr);
    if (cached) return cached as TableClient<S["tables"][K]>;

    const tableDef = config.schema.tables[tableName];
    if (!tableDef) {
      throw new VexiUnknownTableError(tableNameStr, availableTables);
    }

    const embedConfig = extractEmbedConfig(tableDef);

    const insertUrl = joinUrl(apiUrl, "/insert");
    const searchUrl = joinUrl(apiUrl, "/search");

    const doInsert = (
      data: InferDoc<S["tables"][K]>,
      options?: InsertOptions
    ) =>
      postJson<InsertResult>(
        fetcher,
        insertUrl,
        {
          tableName: tableNameStr,
          data,
          embedConfig,
        },
        {
          headers: { ...headers, ...(options?.headers ?? {}) },
          signal: options?.signal,
        }
      );

    const doSearch = async (query: string, options?: SearchOptions) => {
      const raw = await postJson<Array<SearchResult<S["tables"][K]>>>(
        fetcher,
        searchUrl,
        {
          tableName: tableNameStr,
          query,
          limit: options?.limit,
        },
        {
          headers: { ...headers, ...(options?.headers ?? {}) },
          signal: options?.signal,
        }
      );

      // The API currently returns raw docs; keep results flexible while it evolves.
      return raw;
    };

    const client: TableClient<S["tables"][K]> = {
      insert: doInsert,

      insertMany: async (items, options) => {
        return Promise.all(items.map((item) => doInsert(item, options)));
      },

      search: doSearch,
    };

    tableClients.set(tableNameStr, client as TableClient<VTable<any>>);
    return client;
  };

  const out = Object.create(null) as Record<string, unknown>;

  Object.defineProperty(out, "$schema", {
    value: config.schema,
    enumerable: false,
  });

  Object.defineProperty(out, "$url", {
    value: apiUrl,
    enumerable: false,
  });

  Object.defineProperty(out, "$table", {
    value: getTableClient,
    enumerable: false,
  });

  for (const tableName of availableTables as Array<keyof S["tables"]>) {
    Object.defineProperty(out, tableName, {
      enumerable: true,
      get: () => getTableClient(tableName),
    });
  }

  return out as VexiClient<S> & VexiClientHelpers<S>;
}
