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
  // await db.users.insert({ id: "wrong-type", name: 123 });

  // Currently these are just mocks in the SDK
  await db.users.insert({
    id: 1,
    name: "Alice",
    isActive: true,
  });

  // Batch insert products
  await db.products.insert([
    { sku: "P001", price: 100, tags: "electronics" },
    { sku: "P002", price: 200 },
    { sku: "P003", price: 50, tags: "sale" },
  ]);
  console.log("Inserted products batch");

  const results = await db.users.search("Alice");
  console.log("Search Results:", results);
}

main().catch(console.error);
