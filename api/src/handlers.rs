use crate::db::get_registry_entry;
use crate::embeddings::generate_embeddings;
use crate::models::{AppState, InsertRequest, SyncRequest};
use crate::sync;
use arrow_array::RecordBatchIterator;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde_json::{Value, json};
use std::sync::Arc;

/// Health check endpoint
pub async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

/// Sync schema definitions with the server.
///
/// v1: this is the primary entrypoint used by `npx vexi sync`.
pub async fn sync_tables(
    State(state): State<AppState>,
    Json(payload): Json<SyncRequest>,
) -> impl IntoResponse {
    match sync::sync_schema(&state, payload).await {
        Ok((status, value)) => (status, Json(value)).into_response(),
        Err((status, value)) => (status, Json(value)).into_response(),
    }
}

/// List schema registry tables (debug endpoint).
pub async fn list_registry(State(state): State<AppState>) -> impl IntoResponse {
    match sync::list_registry(&state).await {
        Ok((status, value)) => (status, Json(value)).into_response(),
        Err((status, value)) => (status, Json(value)).into_response(),
    }
}

/// Inserts data into a table, automatically generating embeddings if configured.
pub async fn insert_data(
    Path(name): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<InsertRequest>,
) -> impl IntoResponse {
    let mut records = payload.records;
    if records.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "No data to insert" })),
        )
            .into_response();
    }

    // 1. Load schema + embedding config from the v1 registry.
    let Some((table_spec, resolved_embedding, _schema_version)) =
        get_registry_entry(&state.db, &name).await
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Unknown table \"{}\". Run `vexi sync` first.", name) })),
        )
            .into_response();
    };

    // 2. Validate records and inject server-generated ids.
    for record in &mut records {
        let Some(obj) = record.as_object_mut() else {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Each record must be a JSON object" })),
            )
                .into_response();
        };

        if obj.contains_key("id") {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Column \"id\" is reserved (server-generated)" })),
            )
                .into_response();
        }

        // Reject unknown keys.
        for key in obj.keys() {
            if !table_spec.columns.contains_key(key) {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": format!("Unknown column \"{}\" for table \"{}\"", key, name)
                    })),
                )
                    .into_response();
            }
        }

        // Ensure required fields exist + validate types.
        for (col_name, col) in &table_spec.columns {
            let value = obj.get(col_name);
            if value.is_none() {
                if !col.is_optional {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({
                            "error": format!("Missing required column \"{}\"", col_name)
                        })),
                    )
                        .into_response();
                }
                continue;
            }
            let value = value.unwrap();
            if value.is_null() {
                if !col.is_optional {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({
                            "error": format!("Column \"{}\" cannot be null", col_name)
                        })),
                    )
                        .into_response();
                }
                continue;
            }

            let ok = match col.kind {
                crate::models::ColumnKind::String => value.is_string(),
                crate::models::ColumnKind::Number => value.is_number(),
                crate::models::ColumnKind::Boolean => value.is_boolean(),
            };

            if !ok {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": format!("Invalid type for column \"{}\"", col_name)
                    })),
                )
                    .into_response();
            }
        }

        obj.insert(
            "id".to_string(),
            Value::String(uuid::Uuid::new_v4().to_string()),
        );
    }

    // 3. If embeddings are configured, generate vectors.
    //
    // v1 dev UX: allow inserts without an OpenAI key by skipping embeddings.
    // The row will be written without a `vector`, and users can reindex later.
    if let Some(embed_cfg) = resolved_embedding.as_ref()
        && !state.openai_api_key.is_empty()
    {
        let mut inputs: Vec<String> = vec![];
        let mut input_row_indexes: Vec<usize> = vec![];

        for (row_index, record) in records.iter().enumerate() {
            let obj = record.as_object().expect("record validated as object");
            let mut combined = String::new();
            for field in &embed_cfg.fields {
                let Some(v) = obj.get(field) else {
                    continue;
                };
                let Some(s) = v.as_str() else {
                    continue;
                };
                let s = s.trim();
                if s.is_empty() {
                    continue;
                }
                combined.push_str(field);
                combined.push_str(":\n");
                combined.push_str(s);
                combined.push_str("\n\n");
            }

            if combined.is_empty() {
                continue;
            }

            inputs.push(combined);
            input_row_indexes.push(row_index);
        }

        if !inputs.is_empty() {
            let embeddings = generate_embeddings(&inputs, &embed_cfg.model, &state.openai_api_key)
                .await
                .map_err(|e| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": format!("Embedding failed: {}", e) })),
                    )
                });

            let embeddings = match embeddings {
                Ok(v) => v,
                Err(resp) => return resp.into_response(),
            };

            if embeddings.len() != input_row_indexes.len() {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "error": format!(
                            "Embedding provider returned {} vectors for {} inputs",
                            embeddings.len(),
                            input_row_indexes.len()
                        )
                    })),
                )
                    .into_response();
            }

            for (embedding_index, row_index) in input_row_indexes.into_iter().enumerate() {
                let record = &mut records[row_index];
                if let Some(obj) = record.as_object_mut() {
                    obj.insert("vector".to_string(), json!(embeddings[embedding_index]));
                }
            }
        }
    }

    // 4. Insert into LanceDB using the synced schema (no inference).
    let arrow_schema =
        match crate::sync::arrow_schema_for_table(&table_spec, resolved_embedding.as_ref()) {
            Ok(schema) => Arc::new(schema),
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Failed to build Arrow schema: {}", e) })),
                )
                    .into_response();
            }
        };

    // Use arrow_json to convert JSON objects into RecordBatches.
    //
    // `arrow_json::ReaderBuilder` expects a stream of JSON *objects* (commonly newline-delimited
    // JSON / NDJSON), not a single JSON array. Build an NDJSON payload.
    let mut json_lines = String::new();
    for record in &records {
        json_lines.push_str(&serde_json::to_string(record).unwrap());
        json_lines.push('\n');
    }

    let decoder = arrow_json::ReaderBuilder::new(arrow_schema.clone()).build(json_lines.as_bytes());

    // Collect batches
    let batches_result: Result<Vec<_>, _> = decoder.unwrap().collect();

    if let Err(e) = batches_result {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("JSON to Arrow conversion failed: {}", e) })),
        )
            .into_response();
    }
    let batches = batches_result.unwrap();

    // The table should exist after `vexi sync`.
    let t = state
        .db
        .open_table(&name)
        .execute()
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": format!("Table \"{}\" does not exist. Run `vexi sync` first. ({})", name, e)
                })),
            )
        });

    let t = match t {
        Ok(v) => v,
        Err(resp) => return resp.into_response(),
    };

    let reader = RecordBatchIterator::new(batches.into_iter().map(Ok), arrow_schema.clone());
    if let Err(e) = t.add(Box::new(reader)).execute().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    // v1 response: return inserted rows (at least ids).
    (StatusCode::OK, Json(json!({ "ok": true, "rows": records }))).into_response()
}
