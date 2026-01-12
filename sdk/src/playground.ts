import { InferType, v } from "./fields.js";

function main() {
  const a = v.boolean();
  const b = v.optional(v.number());

  type A = InferType<typeof a>;
  type B = InferType<typeof b>;
}

main();
