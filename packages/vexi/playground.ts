import { v, defineTable, defineSchema, createClient } from "./src/index";

// --- 1. Definition (Same as before) ---
const posts = defineTable({
  title: v.string(),
  isPublished: v.boolean(),
  content: v.text().embed({
    model: "openai/text-embedding-3-small",
    strategy: "recursive-markdown",
  }),
});

const schema = defineSchema({
  posts: posts,
});

// --- 2. Runtime Usage ---
// Pass the schema so TS can infer the structure
const db = createClient({ schema });

async function main() {
  console.log("--- Running Mock Insert ---");

  // TRY THIS: Type 'db.' -> You should see 'posts'
  // TRY THIS: Type 'insert({ ... })' -> You should see 'title', 'isPublished', 'content'
  const result = await db.posts.insert({
    title: "Rust is Memory Safe",
    isPublished: true,
    content: "# Hello World\nThis is a test.",
  });

  // Try uncommenting this error to see strict typing in action:
  // await db.posts.insert({ title: 123 }); // Error: Type 'number' is not assignable to type 'string'

  console.log("Result:", result);
}

main();
