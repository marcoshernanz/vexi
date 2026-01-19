use crate::models::EmbeddingConfig;
use arrow_array::Array;
use futures::TryStreamExt;
use lancedb::connection::Connection;
use lancedb::query::ExecutableQuery;

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
