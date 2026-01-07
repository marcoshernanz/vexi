// packages/vexi/src/index.ts

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

export const v = {
  string: () => new VString(),
  boolean: () => new VBoolean(),
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
