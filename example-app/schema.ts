// In a real app, this would be: import { defineTable, v } from "vexi";
import { defineTable, v } from "../sdk/src/index.js";

export const users = defineTable({
  id: v.number(),
  name: v.string(),
  email: v.optional(v.string()),
  isActive: v.boolean(),
});

export const products = defineTable({
  sku: v.string(),
  price: v.number(),
  tags: v.optional(v.string()), // Arrays not yet supported, using string for now
});
