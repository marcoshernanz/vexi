import { v, defineTable, defineSchema } from "./src/index";

// 1. Define a Table
const posts = defineTable({
  title: v.string(),
  isPublished: v.boolean(),
});

const users = defineTable({
  username: v.string(),
});

// 2. Define the Schema
export const schema = defineSchema({
  posts: posts,
  users: users,
});

// 3. Inspect
console.log(JSON.stringify(schema, null, 2));
