import { createTable, v } from "vexi";

export const users = createTable({
  name: v.string().embed(), // default model: models/text-embedding-004
  bio: v.optional(v.string().embed({ strategy: "recursive-markdown" })),
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
