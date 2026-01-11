import type { InferOutput, VOptional, VType } from "./fields";

export type TableShape = Record<string, VType<unknown>>;

// We capture the "Shape" generics so we don't lose the specific keys
export class VTable<Shape extends TableShape> {
  constructor(public readonly shape: Shape) {}
}

export class VSchema<Tables extends Record<string, VTable<any>>> {
  constructor(public readonly tables: Tables) {}
}

// --- Definition Functions ---

export function defineTable<const Shape extends TableShape>(
  shape: Shape
): VTable<Shape> {
  return new VTable(shape);
}

export function defineSchema<const Tables extends Record<string, VTable<any>>>(
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

type Prettify<T> = { [K in keyof T]: T[K] };

type IsOptionalField<T extends VType<any>> = T extends VOptional<any>
  ? true
  : false;

type OptionalKeys<Shape extends TableShape> = {
  [K in keyof Shape]-?: IsOptionalField<Shape[K]> extends true ? K : never;
}[keyof Shape];

type RequiredKeys<Shape extends TableShape> = Exclude<
  keyof Shape,
  OptionalKeys<Shape>
>;

/**
 * Takes a Table Definition and returns the TypeScript Interface for a document.
 * Example: InferDoc<typeof posts> -> { title: string; isPublished: boolean }
 */
export type InferDoc<T extends VTable<any>> = Prettify<
  // Required properties
  {
    [K in RequiredKeys<ShapeOf<T>>]: InferOutput<ShapeOf<T>[K]>;
  } & {
    // Optional properties
    [K in OptionalKeys<ShapeOf<T>>]?: Exclude<
      InferOutput<ShapeOf<T>[K]>,
      undefined
    >;
  }
>;

/**
 * Takes a Schema Definition and returns the full database shape.
 */
export type InferSchema<S extends VSchema<any>> = {
  [K in keyof TablesOf<S>]: InferDoc<TablesOf<S>[K]>;
};
