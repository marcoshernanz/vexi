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
