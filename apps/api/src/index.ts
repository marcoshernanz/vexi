import Fastify from "fastify";
import { Pool } from "pg";
import Redis from "ioredis";
import { randomUUID } from "crypto";
import dotenv from "dotenv";

dotenv.config(); // Load .env variables

const app = Fastify({ logger: true });

// 1. Database Connection (Source of Truth)
const db = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://vexi:password@localhost:5432/vexi_core",
});

// 2. Queue Connection (Message Bus)
// We use raw Redis lists. Node pushes (LPUSH), Rust pops (BLPOP).
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// --- ROUTES ---

// INSERT Endpoint
app.post("/insert", async (req, reply) => {
  const { tableName, data, embedConfig } = req.body as any;

  // A. Generate ID
  const id = randomUUID();

  // B. Transactional Write to Postgres
  // We save the raw JSON immediately. If Redis fails, we still have the data.
  await db.query(
    "INSERT INTO documents (id, table_name, data) VALUES ($1, $2, $3)",
    [id, tableName, data]
  );

  // C. Dispatch Job to Rust
  // Only push to queue if the schema has embedding enabled for a field
  if (embedConfig) {
    const jobPayload = JSON.stringify({
      document_id: id,
      content: data[embedConfig.field], // Extract the text to embed
      model: embedConfig.model,
      chunk_strategy: embedConfig.strategy,
    });

    // "vexi_jobs" is the key the Rust worker listens to
    await redis.lpush("vexi_jobs", jobPayload);
  }

  return { id, status: "queued" };
});

// SEARCH Endpoint
app.post("/search", async (req, reply) => {
  const { tableName, query, limit } = req.body as any;

  // TODO: In Phase 5, we will add query embedding here.
  // For now, we will just return raw documents to prove the connection works.

  const result = await db.query(
    "SELECT data FROM documents WHERE table_name = $1 LIMIT $2",
    [tableName, limit || 10]
  );

  return result.rows.map((row) => row.data);
});

// --- STARTUP ---

const start = async () => {
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
    console.log("🚀 Vexi API running on http://localhost:3000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
