mod db;
mod embeddings;
mod handlers;
mod models;
mod sync;

use crate::handlers::{
    health_check, insert_data, list_registry, search_table, sync_tables, update_row,
};
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
    // v1: the API can start without a Gemini key; it is only required when
    // an embedding operation is requested.
    let gemini_api_key = env::var("GEMINI_API_KEY").unwrap_or_default();

    // v1: we keep the vector dimension explicit to satisfy LanceDB's vector search
    // requirement for fixed-size-list vectors.
    let vector_dim: i32 = env::var("VEXI_VECTOR_DIM")
        .ok()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(768);

    // Initialize Database
    let db = lancedb::connect(&database_path).execute().await.unwrap();
    println!("Connected to LanceDB at {}", database_path);

    // Initialize State
    let state = AppState {
        db,
        gemini_api_key,
        vector_dim,
    };

    // Build Router
    let mut app = Router::new()
        .route("/health", get(health_check))
        .route("/sync", post(sync_tables))
        .route("/tables/{name}/insert", post(insert_data))
        .route("/tables/{name}/search", post(search_table))
        .route("/tables/{name}/{id}", axum::routing::patch(update_row));

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
