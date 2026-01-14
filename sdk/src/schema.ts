import { Field, OptionalField } from "./fields.js";

/**
 * Defines a table structure mapping column names to Fields.
 */
export type TableDefinition = Record<string, Field<unknown>>;

/**
 * Helper function to define a table schema with strict typing.
 * @param fields The object mapping field names to Field definitions.
 * @returns The same fields object, typed as T.
 */
export function defineTable<T extends TableDefinition>(fields: T) {
  return fields;
}

/**
 * Helper type to improve tooltip readability in IDEs.
 * Collapses intersections and mapped types into a single object type.
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Infers the TypeScript interface for a given TableDefinition.
 *
 * This type splits the keys into two groups:
 * 1. Required keys (fields that are NOT OptionalField)
 * 2. Optional keys (fields that ARE OptionalField)
 *
 * It then combines them into a single "prettified" object type.
 */
export type Infer<T> =
  T extends Field<infer Result>
    ? Result
    : Prettify<
        // Required keys
        {
          [K in keyof T as T[K] extends OptionalField<Field<unknown>>
            ? never
            : K]: T[K] extends Field<infer Result> ? Result : never;
        } & {
          // Optional keys
          [K in keyof T as T[K] extends OptionalField<Field<unknown>>
            ? K
            : never]?: T[K] extends Field<infer Result> ? Result : never;
        }
      >;
