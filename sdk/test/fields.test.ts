import { describe, test } from "vitest";
import { expectTypeOf } from "expect-type";
import { v } from "../src/fields.js";
import { type Infer, defineTable } from "../src/schema.js";

describe("Field Type Inference", () => {
  test("primitives", () => {
    // Note: v.string() returns a StringField instance, not the class itself.
    // The Infer type expects an instance.
    expectTypeOf<Infer<ReturnType<typeof v.string>>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<ReturnType<typeof v.number>>>().toEqualTypeOf<number>();
    expectTypeOf<
      Infer<ReturnType<typeof v.boolean>>
    >().toEqualTypeOf<boolean>();
  });

  test("optional fields", () => {
    const _optionalString = v.optional(v.string());
    expectTypeOf<Infer<typeof _optionalString>>().toEqualTypeOf<
      string | undefined
    >();
  });

  test("table definition", () => {
    const _table = defineTable({
      name: v.string(),
      age: v.optional(v.number()),
    });

    type User = Infer<typeof _table>;

    expectTypeOf<User>().toEqualTypeOf<{
      name: string;
      age?: number;
    }>();
  });
});
