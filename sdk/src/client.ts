import { Infer, TableDefinition } from "./schema.js";

type ClientConfig = {
  apiKey: string;
  baseUrl: string;
};

// Interface for operations on a single table
export interface TableClient<Def extends TableDefinition> {
  insert: (data: Infer<Def>) => Promise<void>;
  search: (query: string) => Promise<Infer<Def>[]>;
}

// Definition of the Database Schema
export type DatabaseDefinition = Record<string, TableDefinition>;

// The Client type, mapping table names to TableClients
export type VexiClient<DB extends DatabaseDefinition> = {
  [TableName in keyof DB]: TableClient<DB[TableName]>;
};

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
            // TODO: Implement insert logic
          },

          search: async (query: string) => {
            // TODO: Implement search logic
            return [];
          },
        };
      },
    },
  ) as VexiClient<DB>;
}
