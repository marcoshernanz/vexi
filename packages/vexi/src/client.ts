import { getEmbedConfig, VType, VTable, VSchema, InferDoc } from "./index";

// --- Types ---

export interface InsertResult {
  id: string;
  status: "queued" | (string & {});
}

export interface SearchResult<T extends VTable<any>> {
  _score?: number;
  _match_text?: string;
  _id?: string;
  [key: string]: any;
}

export interface SearchOptions {
  limit?: number;
}

export interface InsertOptions {}

export interface ClientConfig<S extends VSchema<any>> {
  schema: S;
  apiKey?: string;
  apiUrl?: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
}

export type VexiClient<S extends VSchema<any>> = {
  [K in keyof S["tables"]]: {
    insert(
      data: InferDoc<S["tables"][K]>,
      options?: InsertOptions
    ): Promise<InsertResult>;
    search(
      query: string,
      options?: SearchOptions
    ): Promise<Array<SearchResult<S["tables"][K]>>>;
  };
};

// --- Implementation ---

async function postJson<T>(
  fetcher: typeof globalThis.fetch,
  url: string,
  body: unknown,
  headers: Record<string, string>
): Promise<T> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${await response.text()}`
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function createClient<S extends VSchema<any>>(
  config: ClientConfig<S>
): VexiClient<S> {
  const apiUrl = (config.apiUrl ?? "http://localhost:3000").replace(/\/$/, "");
  const fetcher = config.fetch ?? globalThis.fetch;

  if (!fetcher) throw new Error("No fetch implementation found.");

  const headers = {
    ...(config.headers ?? {}),
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };

  const client = {} as any;

  // Iterate over tables in schema to build client
  for (const tableName of Object.keys(config.schema.tables)) {
    const tableDef = config.schema.tables[tableName];

    // Find embedding config for this table
    let embedConfig: any = null;
    for (const [key, field] of Object.entries(tableDef.shape)) {
      const conf = getEmbedConfig(field as VType<any>);
      if (conf) {
        embedConfig = { field: key, ...conf };
        break; // Only one embed field supported
      }
    }

    client[tableName] = {
      insert: async (data: any, options?: InsertOptions) => {
        return postJson(
          fetcher,
          `${apiUrl}/insert`,
          { tableName, data, embedConfig },
          headers
        );
      },
      search: async (query: string, options?: SearchOptions) => {
        return postJson(
          fetcher,
          `${apiUrl}/search`,
          { tableName, query, limit: options?.limit },
          headers
        );
      },
    };
  }

  return client;
}
