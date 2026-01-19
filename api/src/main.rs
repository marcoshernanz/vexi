use arrow_array::{Array, RecordBatchIterator};
use axum::{
    Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
};
use dotenvy::dotenv;
use futures::TryStreamExt;
use lancedb::connection::Connection;
use lancedb::query::ExecutableQuery;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;
use std::{env, net::SocketAddr};
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct AppState {
    db: Connection,
    openai_api_key: String,
}

#[tokio::main]
async fn main() {
    dotenv().ok();

    let database_path = env::var("LANCEDB_URI").expect("LANCEDB_URI must be set");
    let openai_api_key = env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY must be set");

    let db = lancedb::connect(&database_path).execute().await.unwrap();
    println!("Connected to LanceDB at {}", database_path);

    let state = AppState { db, openai_api_key };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/tables", post(create_table))
        .route("/tables/:name/insert", post(insert_data))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

#[derive(Deserialize)]
struct CreateTableRequest {
    name: String,
    #[allow(dead_code)]
    schema: Value, // We'll store the raw schema for now or convert to Arrow
    embedding: Option<EmbeddingConfig>,
}

#[derive(Serialize, Deserialize, Clone)]
struct EmbeddingConfig {
    source_field: String,
    model: String,
}

async fn create_table(
    State(state): State<AppState>,
    Json(payload): Json<CreateTableRequest>,
) -> impl IntoResponse {
    // Save metadata about embedding config

    let config_table_name = "_vexi_metadata";
    // Create config table if not exists (ignoring if it fails due to existing)
    let config_schema = Arc::new(arrow_schema::Schema::new(vec![
        arrow_schema::Field::new("table_name", arrow_schema::DataType::Utf8, false),
        arrow_schema::Field::new("config", arrow_schema::DataType::Utf8, false),
    ]));

    let _ = state
        .db
        .create_empty_table(config_table_name, config_schema.clone())
        .execute()
        .await;

    if let Ok(tbl) = state.db.open_table(config_table_name).execute().await {
        // Upsert logic or just append for now (naive)

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

async fn insert_data(
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
    let arrow_schema_result = infer_schema_from_json(&records[0]);
    if let Err(e) = arrow_schema_result {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("Schema inference failed: {}", e) })),
        )
            .into_response();
    }
    let arrow_schema = Arc::new(arrow_schema_result.unwrap());

    // Use arrow_json to convert Vec<Value> to RecordBatch
    let json_string = serde_json::to_string(&records).unwrap();
    let decoder =
        arrow_json::ReaderBuilder::new(arrow_schema.clone()).build(json_string.as_bytes());

    // Use into_iter to satisfy the iterator requirement for collect
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

// Helpers

async fn get_embedding_config(db: &Connection, table_name: &str) -> Option<EmbeddingConfig> {
    let table = db.open_table("_vexi_metadata").execute().await.ok()?;

    // Note: QueryBase trait provides filter, ExecutableQuery provides execute
    // But sometimes type inference gets confused if methods are mixed with similar names or if trait isn't brought in scope correctly.
    // If filter still complains about Iterator, it means it's picking Iterator::filter.
    // Let's use `only_if` which is LanceDB's alias for filter in some versions, or simply don't filter in SQL and filter in memory since table is small.
    // However, I suspect `QueryBase` import handles `filter`.
    // The previous error was explicit: "Query is not an iterator".
    // This confirms that `filter` from Iterator was being attempted.
    // This happens if `QueryBase` is not in scope or not implemented for Query.
    // But `lancedb::query::Query` implements `QueryBase`.

    // Let's force calling the inherent method or trait method
    // let q = QueryBase::filter(table.query(), format!("table_name = '{}'", table_name));

    // Fallback: Scan all and filter in memory. This is robust and fast for metadata.
    let stream = table.query().execute().await.ok()?;

    let batches_result: Result<Vec<arrow_array::RecordBatch>, _> = stream.try_collect().await;
    let batches = batches_result.ok()?;

    if batches.is_empty() {
        return None;
    }

    for batch in batches {
        let name_col = batch.column_by_name("table_name")?;
        let names = name_col
            .as_any()
            .downcast_ref::<arrow_array::StringArray>()?;

        let config_col = batch.column_by_name("config")?;
        let configs = config_col
            .as_any()
            .downcast_ref::<arrow_array::StringArray>()?;

        for i in 0..batch.num_rows() {
            if names.value(i) == table_name {
                let json_str = configs.value(i);
                if !json_str.is_empty() && json_str != "null" {
                    return serde_json::from_str(json_str).ok();
                }
            }
        }
    }

    None
}

async fn generate_embeddings(
    texts: &[String],
    model: &str,
    api_key: &str,
) -> Result<Vec<Vec<f32>>, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://api.openai.com/v1/embeddings")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({
            "model": model,
            "input": texts
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error: {}", error_text));
    }

    let body: Value = res.json().await.map_err(|e| e.to_string())?;

    let mut embeddings = vec![];
    if let Some(data) = body["data"].as_array() {
        for item in data {
            if let Some(vec) = item["embedding"].as_array() {
                let v: Vec<f32> = vec
                    .iter()
                    .filter_map(|x| x.as_f64().map(|f| f as f32))
                    .collect();
                embeddings.push(v);
            }
        }
    }
    Ok(embeddings)
}

fn infer_schema_from_json(value: &Value) -> Result<arrow_schema::Schema, String> {
    // Very basic inference
    use arrow_schema::{DataType, Field, Schema};

    let obj = value.as_object().ok_or("Root must be object")?;
    let mut fields = vec![];

    for (k, v) in obj {
        let dt = match v {
            Value::String(_) => DataType::Utf8,
            Value::Number(n) => {
                if n.is_f64() {
                    DataType::Float64
                } else {
                    DataType::Int64
                }
            }
            Value::Bool(_) => DataType::Boolean,
            Value::Array(arr) => {
                // Check if it's a vector (array of numbers)
                if !arr.is_empty() && arr[0].is_number() {
                    // Fixed size list would be better for vectors, but List is safer for inference
                    // Using Float32 for vectors (FixedSizeList is better but this works for now)
                    DataType::new_list(DataType::Float32, true)
                } else {
                    DataType::Utf8 // Fallback for other arrays
                }
            }
            _ => DataType::Utf8,
        };
        fields.push(Field::new(k, dt, true));
    }

    Ok(Schema::new(fields))
}
