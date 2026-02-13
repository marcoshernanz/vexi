use lancedb::connection::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub db: Connection,
    pub gemini_api_key: String,
    pub vector_dim: i32,
}

/// Request body for inserting rows.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InsertRequest {
    pub records: Vec<Value>,
}

/// Partial update payload for a row.
///
/// This is the request body for `PATCH /tables/{name}/{id}`.
pub type UpdatePatch = BTreeMap<String, Value>;

/// Response body for row updates.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResponse {
    pub ok: bool,
    pub row: Value,
}

/// Request body for vector search.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub query: String,
    pub top_k: Option<usize>,
}

/// One search result item returned by the API.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultItem {
    pub score: f32,
    pub item: Value,
}

/// Response body for vector search.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub ok: bool,
    pub results: Vec<SearchResultItem>,
}

/// Request body for reindexing a table.
///
/// v1: `POST /tables/{name}/reindex`
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReindexRequest {
    /// Optional batch size for embedding calls.
    ///
    /// If unset, the server uses a conservative default.
    pub embed_batch_size: Option<usize>,
}

/// Response body for table reindexing.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReindexResponse {
    pub ok: bool,
    pub table: String,
    pub rows_scanned: usize,
    pub rows_updated: usize,
    pub vectors_written: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunks_written: Option<usize>,
}

/// A supported column kind in the v1 schema JSON.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ColumnKind {
    String,
    Number,
    Boolean,
}

/// Embedding configuration attached to a column in the v1 schema JSON.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingSpec {
    pub model: Option<String>,
    pub strategy: Option<String>,
}

/// Column definition in the v1 schema JSON.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ColumnSpec {
    pub kind: ColumnKind,
    pub is_optional: bool,
    pub embedding: Option<EmbeddingSpec>,
}

/// Table definition in the v1 schema JSON.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TableSpec {
    pub version: i64,
    pub columns: BTreeMap<String, ColumnSpec>,
}

/// Request payload for `POST /sync`.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncRequest {
    pub tables: BTreeMap<String, TableSpec>,
}

/// A resolved per-table embedding configuration.
///
/// v1: multiple embedded fields roll into a single per-row `vector`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedEmbeddingConfig {
    pub model: String,
    pub strategy: Option<String>,
    pub fields: Vec<String>,
    #[serde(default = "default_vector_dim")]
    pub dim: i32,
}

fn default_vector_dim() -> i32 {
    768
}

/// One action taken as part of a `/sync` request.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncAction {
    pub table: String,
    pub action: SyncActionKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum SyncActionKind {
    Created,
    Migrated,
    Unchanged,
}

/// A warning surfaced during sync.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncWarning {
    pub table: String,
    pub warning: SyncWarningKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum SyncWarningKind {
    EmbeddingConfigChanged,
}

/// Successful response for `POST /sync`.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub ok: bool,
    pub actions: Vec<SyncAction>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<SyncWarning>,
}

/// A per-table error returned by `POST /sync`.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncTableError {
    pub table: String,
    pub message: String,
}

/// Standard API error shape.
///
/// v1: all non-2xx responses should return `{ "error": { ... } }`.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

/// Standard API error response wrapper.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorResponse {
    pub error: ApiError,
}

impl ApiErrorResponse {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: ApiError {
                code: code.into(),
                message: message.into(),
                details: None,
            },
        }
    }

    pub fn with_details(
        code: impl Into<String>,
        message: impl Into<String>,
        details: Value,
    ) -> Self {
        Self {
            error: ApiError {
                code: code.into(),
                message: message.into(),
                details: Some(details),
            },
        }
    }
}
