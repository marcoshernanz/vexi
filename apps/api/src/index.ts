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
  // Construct dynamic INSERT statement for the specific table
  const colNames = Object.keys(data).map((key) => `"${key}"`);
  const colValues = Object.values(data);
  const placeholders = colValues.map((_, i) => `$${i + 2}`); // Start at $2 ($1 is id)

  const sql = `
    INSERT INTO "${tableName}" ("_id", ${colNames.join(", ")}) 
    VALUES ($1, ${placeholders.join(", ")})
  `;

  await db.query(sql, [id, ...colValues]);

  // C. Dispatch Job to Rust
  // Only push to queue if the schema has embedding enabled for a field
  if (embedConfig) {
    const jobPayload = JSON.stringify({
      document_id: id,
      tableName,
      vectorField: `${embedConfig.field}_embedding`,
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

  // TODO: Phase 5 - Add vector search using:
  // ORDER BY embedding <=> $1 LIMIT $2

  const result = await db.query(`SELECT * FROM "${tableName}" LIMIT $1`, [
    limit || 10,
  ]);

  return result.rows;
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
