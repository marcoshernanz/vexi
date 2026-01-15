// In a real app, this would be: import { defineTable, v } from "vexi";
// import { defineTable, v } from "../sdk/src/index.js";
import { defineTable, v } from "../sdk/dist/index.js";

export const users = defineTable({
  id: v.number(),
  name: v.string().embed(), // Default embedding
  bio: v.optional(
    v.string().embed({
      model: "openai/text-embedding-3-small",
      strategy: "recursive-markdown",
    })
  ),
  email: v.optional(v.string()),
  isActive: v.boolean(),
});

export const products = defineTable({
  sku: v.string(),
  name: v.string().embed(),
  description: v.string().embed(),
  price: v.number(),
  tags: v.optional(v.string()), // Arrays not yet supported, using string for now
});
