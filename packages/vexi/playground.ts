import {
  v,
  defineTable,
  defineSchema,
  createClient,
  InferDoc,
} from "./src/index";

const posts = defineTable({
  title: v.string(),
  likes: v.number(),
  content: v.text().embed({
    model: "openai/text-embedding-3-large",
    strategy: "recursive-markdown",
    dimensions: 1536,
  }),
});

const schema = defineSchema({
  posts,
});

const db = createClient({ schema });

type Table = InferDoc<typeof posts>;

async function main() {
  await db.posts.insert({
    title: "Learning Rust",
    likes: 100,
    content: `Rust is a systems programming language focused on safety, speed, and concurrency. It achieves memory safety without garbage collection, making it a great choice for performance-critical applications.`,
  });

  const results = await db.posts.search("Is Rust fast?", { limit: 5 });
}

main();
