import { Field } from "./fields.js";

export type TableDefinition = Record<string, Field<any>>;

export function defineTable<T extends TableDefinition>(fields: T) {
  return fields;
}

export type Infer<T> =
  T extends Field<infer Result>
    ? Result
    : {
        [Key in keyof T]: T[Key] extends Field<infer Result> ? Result : never;
      };
