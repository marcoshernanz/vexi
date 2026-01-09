import { v, defineTable, defineSchema, createClient } from "./src/index";
import { InferDoc } from "./src/schema";

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

type Post = InferDoc<typeof posts>;
// type Post = { title: string; isPublished: boolean; content: string };

async function main() {
  const post: Post = {
    title: "Hello World",
  };

  await db.posts.insert({
    title: "Rust Guide",
  });

  await db.posts.insert({
    title: "Rust Guide",
    isPublished: true,
    content: "Rust is fast.",
  });

  const results = await db.posts.search("Is Rust fast?", { limit: 5 });
}

main();
