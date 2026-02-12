import {
  type InsertInput,
  type Row,
  type SearchResult,
  type Table,
  type TableDefinition,
  type UpdatePatch,
} from "./schema.js";

/**
 * Configuration options for the Vexi client.
 */
export type ClientConfig = {
  /**
   * API key used for authentication.
   *
   * v1: the server may ignore this, but we keep it in the client surface so we don't
   * have to introduce a breaking change once auth lands.
   */
  apiKey?: string;
  /**
   * Base URL for the Vexi API server.
   *
   * Example: `http://localhost:3000`
   */
  baseUrl: string;
};

/**
 * Operations available on a specific table.
 *
 * @template TTable - The table type created by `createTable(...)`.
 */
export type TableClient<TTable extends Table<TableDefinition>> = {
  /**
   * Insert one or many records.
   *
   * The server generates an `id: string` for each inserted row.
   */
  insert(data: InsertInput<TTable>): Promise<Row<TTable>>;
  insert(data: InsertInput<TTable>[]): Promise<Row<TTable>[]>;

  /**
   * Update an existing record by implicit id.
   */
  update: (id: string, patch: UpdatePatch<TTable>) => Promise<Row<TTable>>;

  /**
   * Perform a vector search.
   */
  search: (
    query: string,
    options?: {
      topK?: number;
    },
  ) => Promise<SearchResult<TTable>[]>;
};

/**
 * Database schema definition passed to `createClient`.
 *
 * @example
 * ```ts
 * const db = createClient({
 *   schema: { users, products },
 *   config: { baseUrl: "http://localhost:3000", apiKey: "dev" },
 * });
 * ```
 */
export type DatabaseDefinition = Record<string, Table<TableDefinition>>;

/**
 * The main Vexi client type.
 */
export type VexiClient<DB extends DatabaseDefinition> = {
  [TableName in keyof DB]: TableClient<DB[TableName]>;
};

/**
 * Options for creating a Vexi client.
 */
export type CreateClientOptions<DB extends DatabaseDefinition> = {
  /**
   * Database schema definition.
   */
  schema: DB;
  /**
   * Client configuration.
   */
  config: ClientConfig;
};

type ErrorBody = {
  error?: string;
};

type InsertResponseBody = {
  ok?: boolean;
  rows?: unknown;
  error?: string;
};

type SearchResponseBody = {
  ok?: boolean;
  results?: unknown;
  error?: string;
};

async function readErrorBody(response: Response): Promise<ErrorBody> {
  return (await response.json().catch(() => ({}))) as ErrorBody;
}

/**
 * Creates a strongly-typed Vexi client.
 *
 * The returned object is a Proxy that lets you write `db.users.insert(...)` without
 * generating code for every table.
 */
export function createClient<DB extends DatabaseDefinition>(
  options: CreateClientOptions<DB>,
): VexiClient<DB> {
  const { schema, config } = options;
  const tableNames = new Set(Object.keys(schema));

  return new Proxy(
    {},
    {
      get: (_target, tableNameProp) => {
        const tableName = String(tableNameProp);

        // Help developers catch typos early.
        if (!tableNames.has(tableName)) {
          throw new Error(
            `Unknown table "${tableName}". Did you forget to include it in createClient({ schema: ... })?`,
          );
        }

        type AnyTable = Table<TableDefinition>;
        type AnyInsertInput = InsertInput<AnyTable>;
        type AnyRow = Row<AnyTable>;

        function insert(data: AnyInsertInput): Promise<AnyRow>;
        function insert(data: AnyInsertInput[]): Promise<AnyRow[]>;
        async function insert(
          data: AnyInsertInput | AnyInsertInput[],
        ): Promise<AnyRow | AnyRow[]> {
          const wasArray = Array.isArray(data);
          const records = wasArray ? data : [data];
          const response = await fetch(
            `${config.baseUrl}/tables/${tableName}/insert`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
              },
              body: JSON.stringify({ records }),
            },
          );

          if (!response.ok) {
            const errorBody = await readErrorBody(response);
            throw new Error(
              `Insert failed for "${tableName}": ${errorBody.error ?? response.statusText}`,
            );
          }

          const body = (await response
            .json()
            .catch(() => ({}))) as InsertResponseBody;

          if (!body.ok) {
            throw new Error(
              `Insert failed for "${tableName}": ${body.error ?? response.statusText}`,
            );
          }

          if (!Array.isArray(body.rows)) {
            throw new Error(
              `Insert failed for "${tableName}": response missing rows`,
            );
          }

          const rows = body.rows as Row<Table<TableDefinition>>[];
          if (rows.length !== records.length) {
            throw new Error(
              `Insert failed for "${tableName}": expected ${String(records.length)} row(s) but got ${String(rows.length)}`,
            );
          }

          if (!wasArray && rows.length === 0) {
            throw new Error(
              `Insert failed for "${tableName}": response returned 0 rows`,
            );
          }

          if (wasArray) {
            return rows;
          }
          return rows[0] as AnyRow;
        }

        const tableClient: TableClient<Table<TableDefinition>> = {
          insert,

          update: (_id, _patch) => {
            return Promise.reject(
              new Error(`Update is not implemented yet for "${tableName}".`),
            );
          },

          search: async (query, options) => {
            const response = await fetch(
              `${config.baseUrl}/tables/${tableName}/search`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(config.apiKey
                    ? { Authorization: `Bearer ${config.apiKey}` }
                    : {}),
                },
                body: JSON.stringify({
                  query,
                  topK: options?.topK,
                }),
              },
            );

            if (!response.ok) {
              const errorBody = await readErrorBody(response);
              throw new Error(
                `Search failed for "${tableName}": ${errorBody.error ?? response.statusText}`,
              );
            }

            const body = (await response
              .json()
              .catch(() => ({}))) as SearchResponseBody;

            if (!body.ok) {
              throw new Error(
                `Search failed for "${tableName}": ${body.error ?? response.statusText}`,
              );
            }

            if (!Array.isArray(body.results)) {
              throw new Error(
                `Search failed for "${tableName}": response missing results`,
              );
            }

            return body.results as SearchResult<Table<TableDefinition>>[];
          },
        };

        return tableClient;
      },
    },
  ) as VexiClient<DB>;
}
