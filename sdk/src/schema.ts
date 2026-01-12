import { Validator } from "./fields.js";

export type Schema = Record<string, Validator<any>>;

export function defineTable<S extends Schema>(schema: S) {
  return schema;
}

export type InferType<T> =
  T extends Validator<infer Type>
    ? Type
    : {
        [Key in keyof T]: T[Key] extends Validator<infer Type> ? Type : never;
      };
