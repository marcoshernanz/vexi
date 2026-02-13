use crate::chunking;
use crate::db::{
    ensure_schema_registry, get_registry_entry, list_registry_tables, put_registry_entry,
};
use crate::models::{
    ColumnKind, ResolvedEmbeddingConfig, SyncAction, SyncActionKind, SyncErrorResponse,
    SyncRequest, SyncResponse, SyncTableError, SyncWarning, SyncWarningKind, TableSpec,
};
use axum::http::StatusCode;
use serde_json::json;
use std::collections::BTreeMap;
use std::sync::Arc;

type SyncResult<T> = Result<T, String>;

fn normalize_option_string(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn resolve_embedding_config(
    spec: &TableSpec,
    vector_dim: i32,
) -> SyncResult<Option<ResolvedEmbeddingConfig>> {
    let mut embedded_fields: Vec<String> = vec![];
    let mut model_hint: Option<String> = None;
    let mut strategy_hint: Option<String> = None;

    for (name, col) in &spec.columns {
        let Some(embedding) = &col.embedding else {
            continue;
        };

        if col.kind != ColumnKind::String {
            return Err(format!(
                "Column \"{}\" has embedding config but kind is {:?}; embeddings are only allowed on string columns",
                name, col.kind
            ));
        }

        embedded_fields.push(name.clone());

        if let Some(m) = normalize_option_string(&embedding.model) {
            match &model_hint {
                None => {
                    model_hint = Some(m);
                }
                Some(existing) if existing == &m => {}
                Some(existing) => {
                    return Err(format!(
                        "Conflicting embedding model hints in table: \"{}\" vs \"{}\"",
                        existing, m
                    ));
                }
            }
        }

        if let Some(s) = normalize_option_string(&embedding.strategy) {
            match &strategy_hint {
                None => {
                    strategy_hint = Some(s);
                }
                Some(existing) if existing == &s => {}
                Some(existing) => {
                    return Err(format!(
                        "Conflicting embedding strategies in table: \"{}\" vs \"{}\"",
                        existing, s
                    ));
                }
            }
        }
    }

    if embedded_fields.is_empty() {
        return Ok(None);
    }

    // v1: the server is the source of truth. If the schema provides no model hint,
    // fall back to a server default.
    let model = model_hint.unwrap_or_else(|| "models/text-embedding-004".to_string());

    Ok(Some(ResolvedEmbeddingConfig {
        model,
        strategy: strategy_hint,
        fields: embedded_fields,
        dim: vector_dim,
    }))
}

pub(crate) fn arrow_schema_for_table(
    spec: &TableSpec,
    resolved_embedding: Option<&ResolvedEmbeddingConfig>,
) -> SyncResult<arrow_schema::Schema> {
    if spec.version != 1 {
        return Err(format!(
            "Unsupported table schema version {}; expected 1",
            spec.version
        ));
    }

    let mut fields: Vec<arrow_schema::Field> = vec![];
    // Implicit primary key.
    fields.push(arrow_schema::Field::new(
        "id",
        arrow_schema::DataType::Utf8,
        false,
    ));

    for (name, col) in &spec.columns {
        if name == "id" {
            return Err(
                "Column \"id\" is reserved (server-generated); remove it from schema".to_string(),
            );
        }

        if col.embedding.is_some() && col.kind != ColumnKind::String {
            return Err(format!(
                "Column \"{}\" has embedding config but kind is {:?}; embeddings are only allowed on string columns",
                name, col.kind
            ));
        }

        let dt = match col.kind {
            ColumnKind::String => arrow_schema::DataType::Utf8,
            ColumnKind::Number => arrow_schema::DataType::Float64,
            ColumnKind::Boolean => arrow_schema::DataType::Boolean,
        };

        fields.push(arrow_schema::Field::new(name, dt, col.is_optional));
    }

    if let Some(embed) = resolved_embedding {
        // v1: store embeddings in a single canonical vector column.
        if embed.dim <= 0 {
            return Err(format!(
                "Invalid vector dimension {} (must be > 0)",
                embed.dim
            ));
        }

        let item = arrow_schema::Field::new("item", arrow_schema::DataType::Float32, true);
        fields.push(arrow_schema::Field::new(
            "vector",
            arrow_schema::DataType::FixedSizeList(Arc::new(item), embed.dim),
            true,
        ));
    }

    Ok(arrow_schema::Schema::new(fields))
}

fn compare_and_plan_migration(
    existing: &arrow_schema::Schema,
    desired: &arrow_schema::Schema,
) -> SyncResult<(SyncActionKind, Option<serde_json::Value>)> {
    // v1 safe migrations: allow only additive columns.
    let mut added: Vec<String> = vec![];
    let mut removed: Vec<String> = vec![];
    let mut changed: Vec<String> = vec![];

    let existing_fields = existing.fields();
    let desired_fields = desired.fields();

    let existing_by_name: BTreeMap<&str, &arrow_schema::Field> = existing_fields
        .iter()
        .map(|f| (f.name().as_str(), f.as_ref()))
        .collect();

    let desired_by_name: BTreeMap<&str, &arrow_schema::Field> = desired_fields
        .iter()
        .map(|f| (f.name().as_str(), f.as_ref()))
        .collect();

    for (name, desired_field) in &desired_by_name {
        if let Some(existing_field) = existing_by_name.get(name) {
            if existing_field.data_type() != desired_field.data_type()
                || existing_field.is_nullable() != desired_field.is_nullable()
            {
                changed.push((*name).to_string());
            }
        } else {
            added.push((*name).to_string());
        }
    }

    for name in existing_by_name.keys() {
        if !desired_by_name.contains_key(name) {
            removed.push((*name).to_string());
        }
    }

    if !removed.is_empty() || !changed.is_empty() {
        let mut parts: Vec<String> = vec![];
        if !removed.is_empty() {
            parts.push(format!("removed columns: {}", removed.join(", ")));
        }
        if !changed.is_empty() {
            parts.push(format!("changed columns: {}", changed.join(", ")));
        }
        return Err(format!(
            "Destructive schema change detected (v1 only supports additive migrations): {}",
            parts.join("; ")
        ));
    }

    if added.is_empty() {
        return Ok((SyncActionKind::Unchanged, None));
    }

    Ok((
        SyncActionKind::Migrated,
        Some(json!({ "addedColumns": added })),
    ))
}

pub async fn sync_schema(
    state: &crate::models::AppState,
    request: SyncRequest,
) -> Result<(StatusCode, serde_json::Value), (StatusCode, serde_json::Value)> {
    let mut actions: Vec<SyncAction> = vec![];
    let mut warnings: Vec<SyncWarning> = vec![];
    let mut errors: Vec<SyncTableError> = vec![];
    let mut created_tables: Vec<String> = vec![];

    if request.tables.is_empty() {
        let resp = SyncResponse {
            ok: true,
            actions,
            warnings,
        };
        return Ok((
            StatusCode::OK,
            serde_json::to_value(resp).unwrap_or(json!({ "ok": true })),
        ));
    }

    if let Err(e) = ensure_schema_registry(&state.db).await {
        let err = SyncErrorResponse {
            error: "failed to initialize schema registry".to_string(),
            errors: vec![SyncTableError {
                table: "_registry".to_string(),
                message: e,
            }],
        };
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            serde_json::to_value(err)
                .unwrap_or(json!({ "error": "failed to initialize schema registry" })),
        ));
    }

    let mut registry_updates: Vec<(String, TableSpec, Option<ResolvedEmbeddingConfig>, i64)> =
        vec![];

    // Process each table independently; collect all errors for better DX.
    // Important: we only write to the schema registry if all tables succeed.
    for (table_name, table_spec) in request.tables {
        let result = sync_one_table(state, &table_name, &table_spec).await;
        match result {
            Ok((action, warning, registry_update)) => {
                if matches!(action.action, SyncActionKind::Created) {
                    created_tables.push(action.table.clone());
                }
                actions.push(action);
                if let Some(w) = warning {
                    warnings.push(w);
                }
                registry_updates.push(registry_update);
            }
            Err(message) => {
                errors.push(SyncTableError {
                    table: table_name,
                    message,
                });
            }
        }
    }

    if !errors.is_empty() {
        // Best-effort rollback: drop tables created during this request.
        for table_name in created_tables {
            let _ = state.db.drop_table(&table_name, &[]).await;
        }
        let err = SyncErrorResponse {
            error: "sync failed".to_string(),
            errors,
        };
        return Err((
            StatusCode::BAD_REQUEST,
            serde_json::to_value(err).unwrap_or(json!({ "error": "sync failed" })),
        ));
    }

    for (table_name, table_spec, resolved_embedding, schema_version) in registry_updates {
        put_registry_entry(
            &state.db,
            &table_name,
            &table_spec,
            resolved_embedding.as_ref(),
            schema_version,
        )
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": format!("failed to persist schema registry for {}: {}", table_name, e) }),
            )
        })?;
    }

    let resp = SyncResponse {
        ok: true,
        actions,
        warnings,
    };
    Ok((
        StatusCode::OK,
        serde_json::to_value(resp).unwrap_or(json!({ "ok": true })),
    ))
}

async fn sync_one_table(
    state: &crate::models::AppState,
    table_name: &str,
    table_spec: &TableSpec,
) -> SyncResult<(
    SyncAction,
    Option<SyncWarning>,
    (String, TableSpec, Option<ResolvedEmbeddingConfig>, i64),
)> {
    // Basic validation: table names must not be reserved.
    if table_name.starts_with('_') {
        return Err(
            "Table names starting with '_' are reserved (used for internal metadata).".to_string(),
        );
    }

    let resolved_embedding = resolve_embedding_config(table_spec, state.vector_dim)?;
    let desired_arrow_schema = Arc::new(arrow_schema_for_table(
        table_spec,
        resolved_embedding.as_ref(),
    )?);

    // Read previous registry entry (if present) so we can version + warn.
    let previous = get_registry_entry(&state.db, table_name).await;
    let (prev_embedding, prev_version) = match previous {
        None => (None, 0i64),
        Some((_prev_schema, prev_embed, prev_version)) => (prev_embed, prev_version),
    };

    let embedding_changed = prev_embedding != resolved_embedding;
    let mut warning: Option<SyncWarning> = None;
    if embedding_changed {
        warning = Some(SyncWarning {
            table: table_name.to_string(),
            warning: SyncWarningKind::EmbeddingConfigChanged,
            details: Some(json!({ "requiresReindex": true })),
        });
    }

    // Ensure table exists (or migrate schema if needed).
    let open = state.db.open_table(table_name).execute().await;
    let (action_kind, action_details) = match open {
        Ok(existing_table) => {
            let existing_schema = existing_table.schema().await.map_err(|e| e.to_string())?;

            let (kind, details) =
                compare_and_plan_migration(&existing_schema, &desired_arrow_schema)?;
            if matches!(kind, SyncActionKind::Migrated) {
                // Add new columns as all-null; v1 safe and fast.
                let mut new_fields: Vec<arrow_schema::Field> = vec![];
                for field in desired_arrow_schema.fields() {
                    if existing_schema.field_with_name(field.name()).is_err() {
                        // `AllNulls` requires nullable columns.
                        let mut f = field.as_ref().clone();
                        if !f.is_nullable() {
                            f = f.with_nullable(true);
                        }
                        new_fields.push(f);
                    }
                }

                if !new_fields.is_empty() {
                    let new_schema = Arc::new(arrow_schema::Schema::new(new_fields));
                    existing_table
                        .add_columns(
                            lancedb::table::NewColumnTransform::AllNulls(new_schema),
                            None,
                        )
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
            (kind, details)
        }
        Err(_) => {
            state
                .db
                .create_empty_table(table_name, desired_arrow_schema.clone())
                .execute()
                .await
                .map_err(|e| e.to_string())?;
            (SyncActionKind::Created, None)
        }
    };

    // If chunking is enabled, ensure chunk table exists.
    if let Some(embed_cfg) = resolved_embedding.as_ref()
        && embed_cfg.strategy.as_deref() == Some("recursive-markdown")
    {
        let chunk_table = chunking::chunk_table_name(table_name);
        let chunk_schema = Arc::new(chunking::arrow_schema_for_chunk_table(embed_cfg)?);

        // v1: create chunk table if missing. We don't migrate it yet.
        if state.db.open_table(&chunk_table).execute().await.is_err() {
            state
                .db
                .create_empty_table(&chunk_table, chunk_schema)
                .execute()
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    // Prepare registry update but don't write yet (write only if all tables succeed).
    let next_version = prev_version + 1;
    let registry_update = (
        table_name.to_string(),
        table_spec.clone(),
        resolved_embedding.clone(),
        next_version,
    );

    Ok((
        SyncAction {
            table: table_name.to_string(),
            action: action_kind,
            details: action_details,
        },
        warning,
        registry_update,
    ))
}

/// For debugging / local development, list all tables present in the v1 registry.
pub async fn list_registry(
    state: &crate::models::AppState,
) -> Result<(StatusCode, serde_json::Value), (StatusCode, serde_json::Value)> {
    let tables = list_registry_tables(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })))?;
    Ok((StatusCode::OK, json!({ "ok": true, "tables": tables })))
}
