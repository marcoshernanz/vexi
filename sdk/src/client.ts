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
  apiKey: string;
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
  insert: (
    data: InsertInput<TTable> | InsertInput<TTable>[],
  ) => Promise<void>;

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

        const tableClient: TableClient<Table<TableDefinition>> = {
          insert: async (data) => {
            const records = Array.isArray(data) ? data : [data];
            const response = await fetch(
              `${config.baseUrl}/tables/${tableName}/insert`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify(records),
              },
            );

            if (!response.ok) {
              const errorBody = await readErrorBody(response);
              throw new Error(
                `Insert failed for "${tableName}": ${errorBody.error ?? response.statusText}`,
              );
            }

            // v1: API currently returns `{ success, count }`.
            // We'll evolve this to return inserted rows + ids.
            await response.json().catch(() => undefined);
          },

          update: (_id, _patch) => {
            return Promise.reject(
              new Error(`Update is not implemented yet for "${tableName}".`),
            );
          },

          search: (_query, _options) => {
            // TODO: Implement search logic using config.baseUrl and config.apiKey
            return Promise.resolve([]);
          },
        };

        return tableClient;
      },
    },
  ) as VexiClient<DB>;
}
