use lancedb::connection::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub db: Connection,
    pub openai_api_key: String,
}

/// Request payload for creating a table
#[derive(Deserialize)]
pub struct CreateTableRequest {
    pub name: String,
    #[allow(dead_code)]
    pub schema: Value, // We'll store the raw schema for now or convert to Arrow
    pub embedding: Option<EmbeddingConfig>,
}

/// Configuration for embedding generation
#[derive(Serialize, Deserialize, Clone)]
pub struct EmbeddingConfig {
    pub source_field: String,
    pub model: String,
}
