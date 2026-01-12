import { InferType, Schema } from "./schema.js";

type ClientConfig = {
  apiKey: string;
  baseUrl: string;
};

export function createClient<S extends Record<string, Schema>>(
  schema: S,
  config: ClientConfig,
) {
  return new Proxy(
    {},
    {
      get: (_target, tableName: string) => {
        return {
          insert: async (data: InferType<S[typeof tableName]>) => {
            // TODO
          },

          search: async (query: string) => {
            // TODO
          },
        };
      },
    },
  ) as {
    [K in keyof S]: {
      insert: (data: InferType<S[K]>) => Promise<void>;
      search: (query: string) => Promise<any[]>;
    };
  };
}
