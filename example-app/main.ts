import { createClient } from "vexi";
import { users, products } from "./schema.js";

const db = createClient({
  schema: { users, products },
  config: {
    apiKey: "dev-key",
    baseUrl: "http://localhost:3000",
  },
});

async function main() {
  console.log("Vexi client initialized");
  console.log("Defined tables:", Object.keys({ users, products }));

  // This code is type-checked!
  // Try uncommenting the next line to see strictness:
  // await db.users.insert({ name: 123 });

  const insertedUser = await db.users.insert({
    name: "Alice",
    isActive: true,
    bio: "# About\n\nAlice likes databases.\n\n## Notes\n\n- Writes docs\n- Builds tools\n",
  });
  console.log("Inserted user:", insertedUser);

  const updatedUser = await db.users.update(insertedUser.id, {
    isActive: false,
    bio: "# About\n\nAlice likes databases and now ships v1.\n",
  });
  console.log("Updated user:", updatedUser);

  // Batch insert products
  const insertedProducts = await db.products.insert([
    {
      sku: "P001",
      name: "Wireless Headphones",
      description: "Noise cancelling headphones with 20h battery life.",
      price: 100,
      tags: "electronics",
    },
    {
      sku: "P002",
      name: "Smart Watch",
      description: "Fitness tracker with heart rate monitor.",
      price: 200,
    },
    {
      sku: "P003",
      name: "USB-C Cable",
      description: "Fast charging cable, 2 meters.",
      price: 50,
      tags: "sale",
    },
  ]);
  console.log("Inserted products:", insertedProducts);

  const results = await db.users.search("Alice", { topK: 5 });
  console.log("Search results:");
  for (const r of results) {
    const name = "name" in r.item ? r.item.name : undefined;
    console.log(
      `- score=${String(r.score)} id=${r.item.id} name=${name ? String(name) : "(missing)"}`,
    );
  }

  console.log("\nIf you changed embedding config/model/strategy, run:");
  console.log("- npm run reindex");

  console.log("\nAPI requires GEMINI_API_KEY for embeddings/search/reindex.");
}

main().catch(console.error);
