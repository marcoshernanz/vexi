import { Infer, TableDefinition } from "./schema.js";

/**
 * Configuration options for the Vexi client.
 */
type ClientConfig = {
  apiKey: string;
  baseUrl: string;
};

/**
 * Interface for database operations on a specific table.
 * @template Def The definition of the table structure.
 */
export type TableClient<Def extends TableDefinition> = {
  /**
   * Insert a new record into the table.
   * @param data The record to insert, matching the table schema.
   */
  insert: (data: Infer<Def>) => Promise<void>;

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
 * Creates a strongly-typed Vexi client.
 *
 * @param definition The database definition object (map of table names to schemas).
 * @param config Client configuration (API key, base URL).
 * @returns A proxy object that handles database operations.
 */
export function createClient<DB extends DatabaseDefinition>(
  definition: DB,
  config: ClientConfig,
): VexiClient<DB> {
  return new Proxy(
    {},
    {
      get: (_target, tableName: string) => {
        return {
          insert: async (data: Infer<DB[keyof DB]>) => {
            // TODO: Implement insert logic using config.baseUrl and config.apiKey
            // console.log(`Inserting into ${tableName}`, data);
          },

          search: async (query: string) => {
            // TODO: Implement search logic using config.baseUrl and config.apiKey
            // console.log(`Searching in ${tableName} for "${query}"`);
          },
        };
      },
    },
  ) as VexiClient<DB>;
}
