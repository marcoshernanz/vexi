use lancedb::connection::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

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

/// Error response for `POST /sync`.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncErrorResponse {
    pub error: String,
    pub errors: Vec<SyncTableError>,
}
