use crate::db::get_embedding_config;
use crate::embeddings::generate_embeddings;
use crate::models::{AppState, CreateTableRequest};
use crate::utils::infer_schema_from_json;
use arrow_array::RecordBatchIterator;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde_json::{json, Value};
use std::sync::Arc;

/// Health check endpoint
pub async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

/// Creates a new table and stores embedding configuration if provided.
pub async fn create_table(
    State(state): State<AppState>,
    Json(payload): Json<CreateTableRequest>,
) -> impl IntoResponse {
    let config_table_name = "_vexi_metadata";
    
    // Define schema for metadata table
    let config_schema = Arc::new(arrow_schema::Schema::new(vec![
        arrow_schema::Field::new("table_name", arrow_schema::DataType::Utf8, false),
        arrow_schema::Field::new("config", arrow_schema::DataType::Utf8, false),
    ]));

    // Ensure metadata table exists
    let _ = state
        .db
        .create_empty_table(config_table_name, config_schema.clone())
        .execute()
        .await;

    // Insert metadata
    if let Ok(tbl) = state.db.open_table(config_table_name).execute().await {
        let config_json = serde_json::to_string(&payload.embedding).unwrap_or_default();

        let batch = arrow_array::RecordBatch::try_new(
            config_schema,
            vec![
                Arc::new(arrow_array::StringArray::from(vec![payload.name.clone()])),
                Arc::new(arrow_array::StringArray::from(vec![config_json])),
            ],
        )
        .unwrap();

        let reader = RecordBatchIterator::new(vec![Ok(batch.clone())], batch.schema());
        tbl.add(Box::new(reader)).execute().await.unwrap();
    }

    (
        StatusCode::OK,
        Json(json!({ "success": true, "name": payload.name })),
    )
}

/// Inserts data into a table, automatically generating embeddings if configured.
pub async fn insert_data(
    Path(name): Path<String>,
    State(state): State<AppState>,
    Json(mut records): Json<Vec<Value>>,
) -> impl IntoResponse {
    if records.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "No data to insert" })),
        )
            .into_response();
    }

    // 1. Fetch embedding config for this table
    let embedding_config = get_embedding_config(&state.db, &name).await;

    // 2. If config exists, generate embeddings
    if let Some(config) = embedding_config {
        // Collect texts to embed
        let texts: Vec<String> = records
            .iter()
            .filter_map(|r| {
                r.get(&config.source_field)
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .collect();

        if !texts.is_empty() {
            match generate_embeddings(&texts, &config.model, &state.openai_api_key).await {
                Ok(embeddings) => {
                    // Inject embeddings into records
                    for (i, record) in records.iter_mut().enumerate() {
                        if let Some(obj) = record.as_object_mut() {
                            if i < embeddings.len() {
                                obj.insert("vector".to_string(), json!(embeddings[i]));
                            }
                        }
                    }
                }
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": format!("Embedding failed: {}", e) })),
                    )
                        .into_response();
                }
            }
        }
    }

    // 3. Insert into LanceDB
    
    // Infer Schema from first record
    let arrow_schema_result = infer_schema_from_json(&records[0]);
    if let Err(e) = arrow_schema_result {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Schema inference failed: {}", e) })),
        )
            .into_response();
    }
    let arrow_schema = Arc::new(arrow_schema_result.unwrap());

    // Use arrow_json to convert JSON objects into RecordBatches.
    //
    // `arrow_json::ReaderBuilder` expects a stream of JSON *objects* (commonly newline-delimited
    // JSON / NDJSON), not a single JSON array. Build an NDJSON payload.
    let mut json_lines = String::new();
    for record in &records {
        json_lines.push_str(&serde_json::to_string(record).unwrap());
        json_lines.push('\n');
    }

    let decoder =
        arrow_json::ReaderBuilder::new(arrow_schema.clone()).build(json_lines.as_bytes());

    // Collect batches
    let batches_result: Result<Vec<_>, _> = decoder.unwrap().into_iter().collect();

    if let Err(e) = batches_result {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("JSON to Arrow conversion failed: {}", e) })),
        )
            .into_response();
    }
    let batches = batches_result.unwrap();

    // Create table if not exists, else open
    let table = state.db.open_table(&name).execute().await;

    match table {
        Ok(t) => {
            let reader =
                RecordBatchIterator::new(batches.into_iter().map(Ok), arrow_schema.clone());
            if let Err(e) = t.add(Box::new(reader)).execute().await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        }
        Err(_) => {
            let reader =
                RecordBatchIterator::new(batches.into_iter().map(Ok), arrow_schema.clone());
            if let Err(e) = state
                .db
                .create_table(&name, Box::new(reader))
                .execute()
                .await
            {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
        }
    }

    (
        StatusCode::OK,
        Json(json!({ "success": true, "count": records.len() })),
    )
        .into_response()
}
