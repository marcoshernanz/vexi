// playground.ts
import { v, defineTable, defineSchema, type InferDoc } from "./src/index";

// 1. Define
const posts = defineTable({
  title: v.string(),
  isPublished: v.boolean(),
});

export const schema = defineSchema({
  posts: posts,
});

// 2. The Type Inference Magic
// Hover over 'Post' to see: { title: string; isPublished: boolean }
type Post = InferDoc<typeof posts>;

// 3. Test it
const myData: Post = {
  title: "Systems Engineering",
  isPublished: true,
  // isPublished: "yes" // <--- This would now throw a Red Squiggly line!
};

console.log("Type check passed!");
