import { type Infer, type TableDefinition } from "./schema.js";

/**
 * Configuration options for the Vexi client.
 */
export type ClientConfig = {
  apiKey: string;
  baseUrl: string;
};

/**
 * Interface for database operations on a specific table.
 * @template Def The definition of the table structure.
 */
export type TableClient<Def extends TableDefinition> = {
  /**
   * Insert a new record or multiple records into the table.
   * @param data The record(s) to insert, matching the table schema.
   */
  insert: (data: Infer<Def> | Infer<Def>[]) => Promise<void>;

  /**
   * Search for records in the table.
   * @param query The search query string.
   * @returns A promise resolving to an array of matching records.
   */
  search: (query: string) => Promise<Infer<Def>[]>;
};

/**
 * Definition of the entire database schema, mapping table names to their definitions.
 */
export type DatabaseDefinition = Record<string, TableDefinition>;

/**
 * The main Vexi client interface.
 * Maps every table name in the DB definition to a TableClient for that table.
 */
export type VexiClient<DB extends DatabaseDefinition> = {
  [TableName in keyof DB]: TableClient<DB[TableName]>;
};

/**
 * Options for creating a Vexi client.
 */
export type CreateClientOptions<DB extends DatabaseDefinition> = {
  /**
   * The database schema definition.
   */
  schema: DB;
  /**
   * Client configuration.
   */
  config: ClientConfig;
};

/**
 * Creates a strongly-typed Vexi client.
 *
 * @param options - Configuration options containing the schema and client config.
 * @returns A proxy object that handles database operations.
 */
export function createClient<DB extends DatabaseDefinition>(
  options: CreateClientOptions<DB>,
): VexiClient<DB> {
  const { schema: _schema, config } = options;
  return new Proxy(
    {},
    {
      get: (_target, tableNameProp) => {
        const tableName = String(tableNameProp);
        return {
          insert: async (data: Infer<DB[keyof DB]> | Infer<DB[keyof DB]>[]) => {
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
              const errorBody = (await response.json().catch(() => ({}))) as {
                error?: string;
              };
              throw new Error(
                `Insert failed: ${errorBody.error ?? response.statusText}`,
              );
            }
          },

          search: async (_query: string) => {
            // TODO: Implement search logic using config.baseUrl and config.apiKey
            // console.log(`Searching in ${tableName} for "${query}"`);
          },
        };
      },
    },
  ) as VexiClient<DB>;
}
