// 1. Configuration Types
export type EmbeddingModel =
  | "openai/text-embedding-3-small"
  | "openai/text-embedding-3-large"
  | "cohere/embed-english-v3.0"
  | (string & {}); // Allows custom strings while keeping autocomplete

export type ChunkingStrategy =
  | "recursive-markdown"
  | "paragraph"
  | "sentence"
  | (string & {});

export interface EmbedConfig {
  model: EmbeddingModel;
  strategy: ChunkingStrategy;
}

// --- 1. The Data Types ---

// Generic <Output> tells TypeScript what this field resolves to (e.g., string)
export abstract class VType<Output = any> {
  abstract _type: string;

  // "Phantom" property. It doesn't exist at runtime,
  // but TS uses it to store the inferred type.
  declare _output: Output;
}

export class VString extends VType<string> {
  _type = "string" as const;
}

export class VBoolean extends VType<boolean> {
  _type = "boolean" as const;
}

export class VText extends VType<string> {
  _type = "text" as const;

  // Internal metadata storage
  // We make it public/optional so the SDK builder can read it later
  public _embedConfig?: EmbedConfig;

  /**
   * Marks this field to be automatically embedded by the vector database.
   */
  embed(config: EmbedConfig) {
    this._embedConfig = config;
    return this; // Return 'this' to allow chaining
  }
}

export const v = {
  string: () => new VString(),
  boolean: () => new VBoolean(),
  text: () => new VText(),
};

// --- 2. The Structural Definitions ---

// We capture the "Shape" generics so we don't lose the specific keys
export class VTable<Shape extends Record<string, VType<any>>> {
  _type = "table" as const;
  constructor(public shape: Shape) {}
}

export class VSchema<Tables extends Record<string, VTable<any>>> {
  _type = "schema" as const;
  constructor(public tables: Tables) {}
}

// --- 3. The Definition Functions ---

export function defineTable<T extends Record<string, VType<any>>>(shape: T) {
  return new VTable(shape);
}

export function defineSchema<T extends Record<string, VTable<any>>>(tables: T) {
  return new VSchema(tables);
}

// --- 4. The Inference Helpers (The Magic) ---

/**
 * Takes a Table Definition and returns the TypeScript Interface for a document.
 * Example: InferDoc<typeof posts> -> { title: string; isPublished: boolean }
 */
export type InferDoc<T extends VTable<any>> = {
  // Loop through every key (column) in the table shape
  [K in keyof T["shape"]]: T["shape"][K]["_output"];
};

/**
 * Takes a Schema Definition and returns the full database shape.
 */
export type InferSchema<S extends VSchema<any>> = {
  [K in keyof S["tables"]]: InferDoc<S["tables"][K]>;
};

// 1. Define what a Search Result looks like
// It is the intersection (&) of the Document Type and our system metadata
export type SearchResult<T extends VTable<any>> = InferDoc<T> & {
  _score: number; // Cosine similarity (0 to 1)
  _match_text?: string; // The specific chunk that matched (optional)
};

// 2. Define Search Options
export interface SearchOptions {
  limit?: number; // Defaults to 10
  // In the future, we will add advanced filters here:
  // filter?: { ... }
}

// 1. The interface for a single table client (e.g., db.posts)
// We use generic <T> to know WHICH table we are talking about
export interface TableClient<T extends VTable<any>> {
  insert(data: InferDoc<T>): Promise<{ id: string }>;
  search(query: string, options?: SearchOptions): Promise<SearchResult<T>[]>;
}

// 2. The interface for the Database Client
// It maps every key in the Schema (e.g., "posts") to a TableClient
export type VexiClient<S extends VSchema<any>> = {
  [K in keyof S["tables"]]: TableClient<S["tables"][K]>;
};

// 3. Configuration options
export interface ClientConfig<S extends VSchema<any>> {
  schema: S;
  apiKey?: string; // Optional for now
  apiUrl?: string; // Optional, defaults to cloud
}

export function createClient<S extends VSchema<any>>(
  config: ClientConfig<S>
): VexiClient<S> {
  // We return a Proxy that masquerades as the VexiClient type
  return new Proxy({} as VexiClient<S>, {
    get: (_target, tableName: string) => {
      // Logic: The user accessed db[tableName] (e.g., db.posts)

      // Return the TableClient object
      return {
        insert: async (data: any) => {
          // This is where the runtime magic happens.
          // In the real version, this will fetch() to your Node API.
          console.log(`[SDK] Mocking INSERT into table: "${tableName}"`);
          console.log(`[SDK] Data Payload:`, JSON.stringify(data, null, 2));

          // Mock response
          return { id: "mock-uuid-" + Date.now() };
        },

        search: async (query: string, options?: SearchOptions) => {
          console.log(`[SDK] Mocking SEARCH on table: "${tableName}"`);
          console.log(`[SDK] Query: "${query}"`);
          console.log(`[SDK] Options:`, options);

          // Mock return value
          // We return an empty array for now, cast as the correct type
          // so TypeScript allows it.
          return [] as any;
        },
      };
    },
  });
}
