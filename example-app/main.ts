// In a real app, this would be: import { createClient } from "vexi/client";
import { createClient } from "../sdk/src/index.js";
import { users, products } from "./schema.js";

const db = createClient({
  schema: { users, products },
  config: {
    apiKey: "dev-key",
    baseUrl: "http://localhost:3000",
  },
});

async function main() {
  console.log("🚀 Vexi Client Initialized");
  console.log("Defined tables:", Object.keys({ users, products }));

  // This code is type-checked!
  // Try uncommenting the next line to see strictness:
  // await db.users.insert({ name: 123 });

  await db.users.insert({
    name: "Alice",
    isActive: true,
  });

  // Batch insert products
  await db.products.insert([
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
  console.log("Inserted products batch");

  const results = await db.users.search("Alice");
  console.log("Search Results:", results);
}

main().catch(console.error);
