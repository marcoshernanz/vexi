import { v, defineTable, defineSchema, createClient } from "./src/index";

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

const db = createClient({ schema });

async function main() {
  await db.posts.insert({
    title: "Rust Guide",
    isPublished: true,
    content: "Rust is fast.",
  });

  const results = await db.posts.search("Is Rust fast?", { limit: 5 });
}

main();
