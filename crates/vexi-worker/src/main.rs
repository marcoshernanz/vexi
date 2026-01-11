use anyhow::Result;
use dotenv::dotenv;
use pgvector::Vector;
use redis::AsyncCommands; // Use async redis
use rig::{embeddings::EmbeddingsBuilder, providers::openai};
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use std::env;
use uuid::Uuid;

// The Job Payload matching what Node.js sends
#[derive(Deserialize, Debug)]
struct JobPayload {
    document_id: Uuid,
    tableName: String,
    vectorField: String,
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
    let mut con = client.get_async_connection().await?;

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

    // B. Embed (1-to-1 mapping)
    // Select the model requested by the user schema
    let model = openai.embedding_model(&job.model);

    // Generate embedding for the full content
    let embeddings = EmbeddingsBuilder::new(model.clone())
        .documents(vec![job.content.clone()])?
        .build()
        .await?;

    if let Some(embedding) = embeddings.first() {
        // C. Update Postgres
        // Rig returns f64 usually, pgvector expects f32 mostly, let's cast
        let vec_f32: Vec<f32> = embedding.vec.iter().map(|&x| x as f32).collect();
        let vector = Vector::from(vec_f32);

        // Dynamic SQL update since we don't know the table name at compile time
        // Note: tableName and vectorField come from our internal schema so are trusted-ish
        let sql = format!(
            "UPDATE \"{}\" SET \"{}\" = $1 WHERE \"_id\" = $2",
            job.tableName, job.vectorField
        );

        sqlx::query(&sql)
            .bind(vector)
            .bind(job.document_id)
            .execute(pool) // We can execute directly on pool, no tx needed for single update
            .await?;

        println!("✅ Updated embedding for Doc ID: {}\n", job.document_id);
    }

    Ok(())
}
