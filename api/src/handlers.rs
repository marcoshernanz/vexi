use crate::db::get_registry_entry;
use crate::embeddings::generate_embeddings;
use crate::models::{
    AppState, InsertRequest, SearchRequest, SearchResponse, SearchResultItem, SyncRequest,
};
use crate::sync;
use arrow_array::RecordBatchIterator;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use futures::TryStreamExt;
use lancedb::query::{ExecutableQuery, QueryBase};
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
    // v1 dev UX: allow inserts without a Gemini key by skipping embeddings.
    // The row will be written without a `vector`, and users can reindex later.
    if let Some(embed_cfg) = resolved_embedding.as_ref()
        && !state.gemini_api_key.is_empty()
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
            let embeddings = generate_embeddings(&inputs, &embed_cfg.model, &state.gemini_api_key)
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
                if embeddings[embedding_index].len() != embed_cfg.dim as usize {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": format!(
                                "Embedding dimension mismatch for table \"{}\": expected {} but got {}. Set VEXI_VECTOR_DIM to match your embedding model.",
                                name,
                                embed_cfg.dim,
                                embeddings[embedding_index].len()
                            )
                        })),
                    )
                        .into_response();
                }
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

/// Perform a vector search against a table.
pub async fn search_table(
    Path(name): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<SearchRequest>,
) -> impl IntoResponse {
    let query = payload.query.trim().to_string();
    if query.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Query must be a non-empty string" })),
        )
            .into_response();
    }

    let top_k = payload.top_k.unwrap_or(10);
    if top_k == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "topK must be greater than 0" })),
        )
            .into_response();
    }

    // 1. Load schema + embedding config from the v1 registry.
    let Some((_table_spec, resolved_embedding, _schema_version)) =
        get_registry_entry(&state.db, &name).await
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Unknown table \"{}\". Run `vexi sync` first.", name) })),
        )
            .into_response();
    };

    let Some(embed_cfg) = resolved_embedding.as_ref() else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": format!(
                    "Table \"{}\" has no embedded fields. Add .embed() to at least one string column and run `vexi sync`.",
                    name
                )
            })),
        )
            .into_response();
    };

    if state.gemini_api_key.trim().is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": "Missing GEMINI_API_KEY. Set it on the API server to enable search."
            })),
        )
            .into_response();
    }

    // 2. Embed the query.
    let embeddings = generate_embeddings(&[query], &embed_cfg.model, &state.gemini_api_key)
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

    let Some(query_vector) = embeddings.into_iter().next() else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Embedding provider returned no vectors" })),
        )
            .into_response();
    };

    if query_vector.len() != embed_cfg.dim as usize {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": format!(
                    "Embedding dimension mismatch for table \"{}\": expected {} but got {}. Set VEXI_VECTOR_DIM to match your embedding model.",
                    name,
                    embed_cfg.dim,
                    query_vector.len()
                )
            })),
        )
            .into_response();
    }

    // 3. Query LanceDB.
    let t = match state.db.open_table(&name).execute().await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": format!("Table \"{}\" does not exist. Run `vexi sync` first. ({})", name, e)
                })),
            )
                .into_response();
        }
    };

    let q = match t.query().limit(top_k).nearest_to(query_vector) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Invalid query vector: {}", e) })),
            )
                .into_response();
        }
    };

    let stream = match q.execute().await {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Search query failed: {}", e) })),
            )
                .into_response();
        }
    };

    let batches = match stream.try_collect::<Vec<_>>().await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Search stream failed: {}", e) })),
            )
                .into_response();
        }
    };

    // 4. Convert Arrow batches to JSON rows.
    let mut all_rows: Vec<Value> = vec![];
    for batch in &batches {
        let mut writer = arrow_json::ArrayWriter::new(Vec::<u8>::new());
        if let Err(e) = writer.write(batch) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Failed to encode search results: {}", e) })),
            )
                .into_response();
        }
        if let Err(e) = writer.finish() {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Failed to finalize search results: {}", e) })),
            )
                .into_response();
        }
        let buf = writer.into_inner();
        let arr: Value = match serde_json::from_slice(&buf) {
            Ok(v) => v,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Failed to parse search results JSON: {}", e) })),
                )
                    .into_response();
            }
        };

        let Some(items) = arr.as_array() else {
            continue;
        };
        all_rows.extend(items.iter().cloned());
    }

    // 5. Project into { item, score }.
    // LanceDB includes an automatic `_distance` column for vector search.
    let mut results: Vec<SearchResultItem> = vec![];
    for row in all_rows {
        let Some(mut obj) = row.as_object().cloned() else {
            continue;
        };

        let distance = obj
            .remove("_distance")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32;

        // v1: return score as a monotonic inverse of distance.
        let score = 1.0 / (1.0 + distance);

        // Don't expose internal vector column.
        let _ = obj.remove("vector");

        // Don't expose other internal scoring columns.
        let _ = obj.remove("_score");

        results.push(SearchResultItem {
            score,
            item: Value::Object(obj),
        });
    }

    let resp = SearchResponse { ok: true, results };
    (StatusCode::OK, Json(resp)).into_response()
}
