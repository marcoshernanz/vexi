import Fastify from "fastify";
import { Pool } from "pg";
import Redis from "ioredis";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config(); // Load .env variables

const app = Fastify({ logger: true });
const openai = new OpenAI();

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

  // 1. Generate Query Embedding
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const vector = JSON.stringify(embeddingResponse.data[0].embedding);
  const k = limit || 10;

  // 2. Perform Hybrid Search
  // Algorithm: Linear Combination (0.8 * Vector + 0.2 * Keyword)
  // We search chunks, score them, and aggregate by document.

  const sql = `
    WITH matches AS (
      SELECT 
        parent_id,
        chunk_text,
        (1 - (embedding <=> $1)) as semantic_score,
        ts_rank_cd(to_tsvector('english', chunk_text), websearch_to_tsquery('english', $3)) as keyword_score
      FROM "${tableName}_embeddings"
    )
    SELECT 
      doc.*,
      MAX(
        COALESCE(matches.semantic_score, 0) * 0.8 + 
        COALESCE(matches.keyword_score, 0) * 0.2
      ) as _score,
      -- Return the best matching chunk text for specific context
      (ARRAY_AGG(matches.chunk_text ORDER BY matches.semantic_score DESC))[1] as _match_text
    FROM matches
    JOIN "${tableName}" doc ON matches.parent_id = doc._id
    GROUP BY doc._id
    ORDER BY _score DESC
    LIMIT $2;
  `;

  try {
    const result = await db.query(sql, [vector, k, query]);
    return result.rows;
  } catch (e) {
    req.log.error(e);
    // Fallback or rethrow
    throw e;
  }
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
