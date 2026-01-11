use anyhow::Result;
use dotenv::dotenv;
use pgvector::Vector;
use redis::AsyncCommands;
use rig::client::EmbeddingsClient;
use rig::client::ProviderClient; // Required for from_env
use rig::embeddings::EmbeddingsBuilder;
use rig::providers::openai;
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use std::env;
use text_splitter::TextSplitter;
use uuid::Uuid;

// The Job Payload matching what Node.js sends
#[derive(Deserialize, Debug)]
struct JobPayload {
    document_id: Uuid,
    tableName: String,
    content: String,
    model: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();
    println!("🦀 Vexi Worker Starting...");

    // 1. Database Connection Pool
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // 2. Redis Connection
    let redis_url = env::var("REDIS_URL").expect("REDIS_URL must be set");
    let client = redis::Client::open(redis_url)?;
    let mut con = client.get_multiplexed_async_connection().await?;

    // 3. AI Provider (Rig)
    let openai_client = openai::Client::from_env();

    println!("🚀 Listening for jobs on 'vexi_jobs'...");

    loop {
        // 4. Blocking Pop (BLPOP)
        // This waits efficiently until a job arrives.
        // Returns a tuple: (key, value)
        let result: Option<(String, String)> = con.blpop("vexi_jobs", 0.0).await?;

        if let Some((_list, job_json)) = result {
            println!("📥 Received Job");

            // Process the job. If it fails, print error but don't crash the worker.
            if let Err(e) = process_job(&job_json, &pool, &openai_client).await {
                eprintln!("❌ Failed to process job: {}", e);
            }
        }
    }
}

async fn process_job(json_str: &str, pool: &sqlx::PgPool, openai: &openai::Client) -> Result<()> {
    // A. Parse
    let job: JobPayload = serde_json::from_str(json_str)?;
    println!(
        "Processing Doc ID: {} for table {}",
        job.document_id, job.tableName
    );

    // B. Chunk
    // We trim chunks to fit context windows efficiently
    // 500 characters roughly
    let splitter = TextSplitter::new(500);
    let chunks: Vec<&str> = splitter.chunks(&job.content).collect();
    println!("✂️  Split into {} chunks", chunks.len());

    // C. Embed matches chunks
    let model = openai.embedding_model(&job.model);

    // Batch API call
    let results = EmbeddingsBuilder::new(model.clone())
        .documents(chunks.clone())?
        .build()
        .await?;

    // D. Transactional Write to Embeddings Table
    // The table name is derived: {tableName}_embeddings
    let embed_table_name = format!("{}_embeddings", job.tableName);
    let mut tx = pool.begin().await?;

    // 1. Clean up existing vectors for this doc (Idempotency)
    // Dynamic SQL required
    let delete_sql = format!("DELETE FROM \"{}\" WHERE parent_id = $1", embed_table_name);
    sqlx::query(&delete_sql)
        .bind(job.document_id)
        .execute(&mut *tx)
        .await?;

    // 2. Insert new vectors
    for (i, (_, embeddings_wrapper)) in results.into_iter().enumerate() {
        let chunk_text = chunks[i];
        let embedding = embeddings_wrapper.first();
        let vec_f32: Vec<f32> = embedding.vec.iter().map(|&x| x as f32).collect();
        let vector = Vector::from(vec_f32);

        let insert_sql = format!(
            "INSERT INTO \"{}\" (parent_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, $4)",
            embed_table_name
        );

        sqlx::query(&insert_sql)
            .bind(job.document_id)
            .bind(i as i32)
            .bind(chunk_text)
            .bind(vector)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    println!("✅ Indexed Doc ID: {}\n", job.document_id);

    Ok(())
}
