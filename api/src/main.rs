mod db;
mod embeddings;
mod handlers;
mod models;
mod utils;

use crate::handlers::{create_table, health_check, insert_data};
use crate::models::AppState;
use axum::{
    routing::{get, post},
    Router,
};
use dotenvy::dotenv;
use std::net::SocketAddr;
use std::env;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    // Load environment variables
    dotenv().ok();

    let database_path = env::var("LANCEDB_URI").unwrap_or_else(|_| ".lancedb".to_string());
    let openai_api_key = env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY must be set");

    // Initialize Database
    let db = lancedb::connect(&database_path).execute().await.unwrap();
    println!("Connected to LanceDB at {}", database_path);

    // Initialize State
    let state = AppState { db, openai_api_key };

    // Build Router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/tables", post(create_table))
        .route("/tables/{name}/insert", post(insert_data))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Start Server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
