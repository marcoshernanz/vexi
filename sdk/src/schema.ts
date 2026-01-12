import { Field, OptionalField } from "./fields.js";

export type TableDefinition = Record<string, Field<any>>;

export function defineTable<T extends TableDefinition>(fields: T) {
  return fields;
}

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type Infer<T> =
  T extends Field<infer Result>
    ? Result
    : Prettify<
        {
          [K in keyof T as T[K] extends OptionalField<any>
            ? never
            : K]: T[K] extends Field<infer Result> ? Result : never;
        } & {
          [K in keyof T as T[K] extends OptionalField<any>
            ? K
            : never]?: T[K] extends Field<infer Result> ? Result : never;
        }
      >;
