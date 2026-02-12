// In a real app, this would be: import { createTable, v } from "vexi";
import { createTable, v } from "../sdk/src/index.js";

export const users = createTable({
  name: v.string().embed(), // Default embedding
  bio: v.optional(
    v.string().embed({
      model: "models/text-embedding-004",
      strategy: "recursive-markdown",
    }),
  ),
  email: v.optional(v.string()),
  isActive: v.boolean(),
});

export const products = createTable({
  sku: v.string(),
  name: v.string().embed(),
  description: v.string().embed(),
  price: v.number(),
  tags: v.optional(v.string()), // Arrays not yet supported, using string for now
});
