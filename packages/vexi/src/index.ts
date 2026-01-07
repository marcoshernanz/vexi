// --- 1. The Data Types (The "Atoms") ---

// Base class for any value that can go inside a table column
export abstract class VType {
  abstract _type: string;
}

export class VString extends VType {
  _type = "string" as const;
}

export class VBoolean extends VType {
  _type = "boolean" as const;
}

// The 'v' namespace contains ONLY types
export const v = {
  string: () => new VString(),
  boolean: () => new VBoolean(),
};

// --- 2. The Structural Definitions (The "Containers") ---

export class VTable<Shape extends Record<string, VType>> {
  _type = "table" as const;
  constructor(public shape: Shape) {}
}

export class VSchema<Tables extends Record<string, VTable<any>>> {
  _type = "schema" as const;
  constructor(public tables: Tables) {}
}

// --- 3. The Definition Functions ---

/**
 * Defines a table structure.
 * It ONLY accepts an object where values are VTypes (string, boolean, etc).
 * It will REJECT a nested table or schema.
 */
export function defineTable<T extends Record<string, VType>>(shape: T) {
  return new VTable(shape);
}

/**
 * Defines the database schema.
 * It ONLY accepts an object where values are VTables.
 */
export function defineSchema<T extends Record<string, VTable<any>>>(tables: T) {
  return new VSchema(tables);
}
