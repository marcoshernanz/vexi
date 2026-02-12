use crate::models::{EmbeddingConfig, ResolvedEmbeddingConfig, TableSpec};
use arrow_array::Array;
use futures::TryStreamExt;
use lancedb::connection::Connection;
use lancedb::query::ExecutableQuery;
use std::sync::Arc;

/// Retrieves the embedding configuration for a specific table from the metadata table.
pub async fn get_embedding_config(db: &Connection, table_name: &str) -> Option<EmbeddingConfig> {
    // Open the metadata table. If it fails, assume no config exists.
    let table = db.open_table("_vexi_metadata").execute().await.ok()?;

    // Scan the table to find the config for the given table name.
    // Ideally, we would use `.filter()` here, but we are doing in-memory filtering
    // as a robust fallback for now.
    let stream = table.query().execute().await.ok()?;

    let batches_result: Result<Vec<arrow_array::RecordBatch>, _> = stream.try_collect().await;
    let batches = batches_result.ok()?;

    if batches.is_empty() {
        return None;
    }

    // Iterate through batches and rows to find the match
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

const REGISTRY_TABLE_NAME: &str = "_vexi_schema_registry";

fn registry_schema() -> Arc<arrow_schema::Schema> {
    Arc::new(arrow_schema::Schema::new(vec![
        arrow_schema::Field::new("table_name", arrow_schema::DataType::Utf8, false),
        arrow_schema::Field::new("schema_json", arrow_schema::DataType::Utf8, false),
        arrow_schema::Field::new(
            "resolved_embedding_json",
            arrow_schema::DataType::Utf8,
            true,
        ),
        arrow_schema::Field::new("schema_version", arrow_schema::DataType::Int64, false),
        arrow_schema::Field::new("updated_at", arrow_schema::DataType::Utf8, true),
    ]))
}

/// Ensures the v1 schema registry table exists.
pub async fn ensure_schema_registry(db: &Connection) -> Result<(), String> {
    let schema = registry_schema();
    // If it already exists, this will return an error; we ignore it.
    let _ = db
        .create_empty_table(REGISTRY_TABLE_NAME, schema)
        .execute()
        .await;
    Ok(())
}

/// Load the latest stored schema registry entry for a table.
pub async fn get_registry_entry(
    db: &Connection,
    table_name: &str,
) -> Option<(TableSpec, Option<ResolvedEmbeddingConfig>, i64)> {
    let table = db.open_table(REGISTRY_TABLE_NAME).execute().await.ok()?;

    let stream = table.query().execute().await.ok()?;
    let batches: Vec<arrow_array::RecordBatch> = stream.try_collect().await.ok()?;

    let mut best_version: Option<i64> = None;
    let mut best_schema: Option<TableSpec> = None;
    let mut best_embedding: Option<Option<ResolvedEmbeddingConfig>> = None;

    for batch in batches {
        let name_col = batch.column_by_name("table_name")?;
        let names = name_col
            .as_any()
            .downcast_ref::<arrow_array::StringArray>()?;

        let schema_col = batch.column_by_name("schema_json")?;
        let schemas = schema_col
            .as_any()
            .downcast_ref::<arrow_array::StringArray>()?;

        let embedding_col = batch.column_by_name("resolved_embedding_json")?;
        let embeddings = embedding_col
            .as_any()
            .downcast_ref::<arrow_array::StringArray>()?;

        let version_col = batch.column_by_name("schema_version")?;
        let versions = version_col
            .as_any()
            .downcast_ref::<arrow_array::Int64Array>()?;

        for i in 0..batch.num_rows() {
            if names.value(i) != table_name {
                continue;
            }

            let version = versions.value(i);
            let should_take = best_version.is_none_or(|v| version > v);
            if !should_take {
                continue;
            }

            let schema_json = schemas.value(i);
            let Ok(parsed_schema) = serde_json::from_str::<TableSpec>(schema_json) else {
                continue;
            };

            let resolved_embedding: Option<ResolvedEmbeddingConfig> = if embeddings.is_null(i) {
                None
            } else {
                let s = embeddings.value(i);
                if s.is_empty() || s == "null" {
                    None
                } else {
                    serde_json::from_str::<ResolvedEmbeddingConfig>(s).ok()
                }
            };

            best_version = Some(version);
            best_schema = Some(parsed_schema);
            best_embedding = Some(resolved_embedding);
        }
    }

    Some((best_schema?, best_embedding.unwrap_or(None), best_version?))
}

/// Persist a new schema registry entry for a table.
pub async fn put_registry_entry(
    db: &Connection,
    table_name: &str,
    schema: &TableSpec,
    resolved_embedding: Option<&ResolvedEmbeddingConfig>,
    schema_version: i64,
) -> Result<(), String> {
    ensure_schema_registry(db).await?;

    let tbl = db
        .open_table(REGISTRY_TABLE_NAME)
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    let schema_json = serde_json::to_string(schema).map_err(|e| e.to_string())?;
    let resolved_embedding_json = resolved_embedding
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| e.to_string())?;

    let now = std::time::SystemTime::now();
    let updated_at = now
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string());

    let schema = registry_schema();
    let batch = arrow_array::RecordBatch::try_new(
        schema.clone(),
        vec![
            Arc::new(arrow_array::StringArray::from(vec![table_name.to_string()])),
            Arc::new(arrow_array::StringArray::from(vec![schema_json])),
            Arc::new(arrow_array::StringArray::from(vec![
                resolved_embedding_json,
            ])),
            Arc::new(arrow_array::Int64Array::from(vec![schema_version])),
            Arc::new(arrow_array::StringArray::from(vec![Some(updated_at)])),
        ],
    )
    .map_err(|e| e.to_string())?;

    let reader = arrow_array::RecordBatchIterator::new(vec![Ok(batch.clone())], batch.schema());
    tbl.add(Box::new(reader))
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// List all tables currently present in the schema registry.
pub async fn list_registry_tables(db: &Connection) -> Result<Vec<String>, String> {
    let table = db
        .open_table(REGISTRY_TABLE_NAME)
        .execute()
        .await
        .map_err(|e| e.to_string())?;

    let stream = table.query().execute().await.map_err(|e| e.to_string())?;
    let batches: Vec<arrow_array::RecordBatch> =
        stream.try_collect().await.map_err(|e| e.to_string())?;

    let mut names = std::collections::BTreeSet::<String>::new();
    for batch in batches {
        let name_col = batch
            .column_by_name("table_name")
            .ok_or_else(|| "registry missing table_name column".to_string())?;
        let name_arr = name_col
            .as_any()
            .downcast_ref::<arrow_array::StringArray>()
            .ok_or_else(|| "registry table_name column has wrong type".to_string())?;
        for i in 0..batch.num_rows() {
            names.insert(name_arr.value(i).to_string());
        }
    }

    Ok(names.into_iter().collect())
}
