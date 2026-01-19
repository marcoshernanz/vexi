import { describe, test, vi, expect, beforeEach } from "vitest";
import { expectTypeOf } from "expect-type";
import { createClient } from "../src/client.js";
import { v } from "../src/fields.js";
import { defineTable } from "../src/schema.js";

// Setup Schema
const users = defineTable({ name: v.string(), age: v.number() });
const posts = defineTable({ title: v.string(), content: v.string() });
const schema = { users, posts };

// Setup Client
const client = createClient({
  schema,
  config: { apiKey: "test-key", baseUrl: "https://api.vexi.ai" },
});

describe("Client Type Safety", () => {
  test("table access", () => {
    expectTypeOf(client).toHaveProperty("users");
    expectTypeOf(client).toHaveProperty("posts");
  });

  test("method signatures", () => {
    type User = { name: string; age: number };

    expectTypeOf(client.users.insert).parameters.toEqualTypeOf<
      [User | User[]]
    >();
    expectTypeOf(client.users.search).returns.resolves.toEqualTypeOf<User[]>();
  });
});

describe("Client Runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("proxy constructs correct API calls", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    await client.users.insert({ name: "Alice", age: 30 });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.vexi.ai/tables/users/insert",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify([{ name: "Alice", age: 30 }]),
      }),
    );
  });
});
