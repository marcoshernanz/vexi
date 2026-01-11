import { VType } from "./fields";

export type TableShape = Record<string, VType<any>>;

export class VTable<Shape extends TableShape> {
  constructor(public readonly shape: Shape) {}
}

export class VSchema<Tables extends Record<string, VTable<any>>> {
  constructor(public readonly tables: Tables) {}
}

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

// Inference Types

type ExtractOutput<T> = T extends VType<infer O> ? O : never;

export type InferDoc<T extends VTable<any>> = {
  // Required keys: Output type does NOT include undefined
  [K in keyof T["shape"] as undefined extends ExtractOutput<T["shape"][K]>
    ? never
    : K]: ExtractOutput<T["shape"][K]>;
} & {
  // Optional keys: Output type DOES include undefined
  [K in keyof T["shape"] as undefined extends ExtractOutput<T["shape"][K]>
    ? K
    : never]?: Exclude<ExtractOutput<T["shape"][K]>, undefined>;
};

export type InferSchema<S extends VSchema<any>> = {
  [K in keyof S["tables"]]: InferDoc<S["tables"][K]>;
};
