import { v, defineTable, defineSchema, type InferDoc } from "./src/index";

// 1. Define
const posts = defineTable({
  title: v.string(),
  isPublished: v.boolean(),

  // The Magic: Autocomplete works here!
  content: v.text().embed({
    model: "openai/text-embedding-3-small",
    strategy: "recursive-markdown",
  }),
});

export const schema = defineSchema({
  posts: posts,
});

// 2. Inspect the JSON
// You will see the '_embedConfig' inside the structure now
console.log(JSON.stringify(schema, null, 2));

// 3. Verify Types
// 'content' should still be inferred as 'string' because the user
// writes string text to it. The vectors are invisible implementation details.
type Post = InferDoc<typeof posts>;
const myPost: Post = {
  title: "Hello Vexi",
  isPublished: true,
  content: "# This is a long post...", // Success
};
