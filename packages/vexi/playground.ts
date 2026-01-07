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
  // 1. Insert (as before)
  await db.posts.insert({
    title: "Rust Guide",
    isPublished: true,
    content: "Rust is fast.",
  });

  // 2. Search
  console.log("\n--- Running Mock Search ---");

  const results = await db.posts.search("Is Rust fast?", { limit: 5 });

  // 3. Verify Type Safety on Results
  if (results.length > 0) {
    const doc = results[0];

    // TypeScript knows these exist:
    console.log(doc.title); // string
    console.log(doc._score); // number

    // TypeScript knows this DOES NOT exist:
    // console.log(doc.random); // Error!
  }
}

main();
