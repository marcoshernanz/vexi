mod db;
mod embeddings;
mod handlers;
mod models;
mod sync;

use crate::handlers::{health_check, insert_data, list_registry, sync_tables};
use crate::models::AppState;
use axum::{
    Router,
    routing::{get, post},
};
use dotenvy::dotenv;
use std::env;
use std::net::Ipv6Addr;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    // Load environment variables
    dotenv().ok();

    let database_path = env::var("LANCEDB_URI").unwrap_or_else(|_| ".lancedb".to_string());
    // v1: the API can start without an OpenAI key; it is only required when
    // an embedding operation is requested.
    let openai_api_key = env::var("OPENAI_API_KEY").unwrap_or_default();

    // Initialize Database
    let db = lancedb::connect(&database_path).execute().await.unwrap();
    println!("Connected to LanceDB at {}", database_path);

    // Initialize State
    let state = AppState { db, openai_api_key };

    // Build Router
    let mut app = Router::new()
        .route("/health", get(health_check))
        .route("/sync", post(sync_tables))
        .route("/tables/{name}/insert", post(insert_data));

    if env::var("VEXI_DEBUG").ok().as_deref() == Some("1") {
        app = app.route("/registry", get(list_registry));
    }

    let app = app.layer(CorsLayer::permissive()).with_state(state);

    // Start Server
    // Bind on IPv6 unspecified so `localhost` (often ::1) works in Node fetch.
    // This is typically dual-stack on modern OSes.
    let addr = SocketAddr::from((Ipv6Addr::UNSPECIFIED, 3000));
    println!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
