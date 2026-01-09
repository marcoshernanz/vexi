import type { InferOutput, VType } from "./fields";

export type TableShape = Record<string, VType<any>>;

// We capture the "Shape" generics so we don't lose the specific keys
export class VTable<Shape extends TableShape> {
  readonly _type = "table" as const;
  constructor(public readonly shape: Shape) {}
}

export class VSchema<Tables extends Record<string, VTable<any>>> {
  readonly _type = "schema" as const;
  constructor(public readonly tables: Tables) {}
}

// --- Definition Functions ---

export function defineTable<Shape extends TableShape>(
  shape: Shape
): VTable<Shape> {
  return new VTable(shape);
}

export function defineSchema<Tables extends Record<string, VTable<any>>>(
  tables: Tables
): VSchema<Tables> {
  return new VSchema(tables);
}

// --- Inference Helpers ---

type ShapeOf<T extends VTable<any>> = T extends VTable<infer Shape>
  ? Shape
  : never;

type TablesOf<S extends VSchema<any>> = S extends VSchema<infer Tables>
  ? Tables
  : never;

type OptionalKeys<Shape extends TableShape> = {
  [K in keyof Shape]-?: undefined extends InferOutput<Shape[K]> ? K : never;
}[keyof Shape];

type RequiredKeys<Shape extends TableShape> = Exclude<
  keyof Shape,
  OptionalKeys<Shape>
>;

/**
 * Takes a Table Definition and returns the TypeScript Interface for a document.
 * Example: InferDoc<typeof posts> -> { title: string; isPublished: boolean }
 */
export type InferDoc<T extends VTable<any>> =
  // Required properties
  {
    [K in RequiredKeys<ShapeOf<T>>]: InferOutput<ShapeOf<T>[K]>;
  } & { // Optional properties (when output includes undefined)
    [K in OptionalKeys<ShapeOf<T>>]?: Exclude<
      InferOutput<ShapeOf<T>[K]>,
      undefined
    >;
  };

/**
 * Takes a Schema Definition and returns the full database shape.
 */
export type InferSchema<S extends VSchema<any>> = {
  [K in keyof TablesOf<S>]: InferDoc<TablesOf<S>[K]>;
};
