use crate::models::ResolvedEmbeddingConfig;
use arrow_schema::{DataType, Field, Schema};
use serde_json::{Map as JsonMap, Value};
use std::sync::Arc;

const DEFAULT_CHUNK_MAX_CHARS: usize = 1200;
const DEFAULT_CHUNK_OVERLAP_BLOCKS: usize = 1;
const DEFAULT_LONG_BLOCK_OVERLAP_CHARS: usize = 200;

pub(crate) fn chunk_table_name(base_table: &str) -> String {
    format!("_vexi_chunks_{}", base_table)
}

pub(crate) fn chunk_id(parent_id: &str, ordinal: usize) -> String {
    format!("{}:{}", parent_id, ordinal)
}

pub(crate) fn arrow_schema_for_chunk_table(
    embed_cfg: &ResolvedEmbeddingConfig,
) -> Result<Schema, String> {
    if embed_cfg.dim <= 0 {
        return Err(format!(
            "Invalid vector dimension {} (must be > 0)",
            embed_cfg.dim
        ));
    }

    let item = Field::new("item", DataType::Float32, true);
    Ok(Schema::new(vec![
        Field::new("chunk_id", DataType::Utf8, false),
        Field::new("parent_id", DataType::Utf8, false),
        Field::new("chunk_text", DataType::Utf8, false),
        Field::new(
            "vector",
            DataType::FixedSizeList(Arc::new(item), embed_cfg.dim),
            true,
        ),
        Field::new("ordinal", DataType::Int64, true),
        Field::new("source_fields", DataType::Utf8, true),
    ]))
}

pub(crate) fn build_combined_embed_text(
    obj: &JsonMap<String, Value>,
    fields: &[String],
    strategy: Option<&str>,
) -> String {
    let mut combined = String::new();
    let markdown = strategy == Some("recursive-markdown");

    for field in fields {
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

        if markdown {
            combined.push_str("# ");
            combined.push_str(field);
            combined.push('\n');
            combined.push_str(s);
            combined.push_str("\n\n");
        } else {
            combined.push_str(field);
            combined.push_str(":\n");
            combined.push_str(s);
            combined.push_str("\n\n");
        }
    }

    combined
}

fn is_heading_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('#') {
        return false;
    }

    let hashes = trimmed.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 6 {
        return false;
    }

    // Safe because `#` is ASCII.
    let rest = &trimmed[hashes..];
    rest.starts_with(' ') || rest.is_empty()
}

fn char_len(s: &str) -> usize {
    s.chars().count()
}

fn split_markdown_blocks(text: &str) -> Vec<String> {
    let mut blocks: Vec<String> = vec![];
    let mut current = String::new();

    for line in text.lines() {
        if line.trim().is_empty() {
            if !current.trim().is_empty() {
                blocks.push(current.trim_end().to_string());
                current.clear();
            }
            continue;
        }

        if is_heading_line(line) {
            if !current.trim().is_empty() {
                blocks.push(current.trim_end().to_string());
                current.clear();
            }
            blocks.push(line.trim_end().to_string());
            continue;
        }

        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(line);
    }

    if !current.trim().is_empty() {
        blocks.push(current.trim_end().to_string());
    }

    blocks
}

fn split_long_block(block: &str, max_chars: usize, overlap_chars: usize) -> Vec<String> {
    if char_len(block) <= max_chars {
        return vec![block.to_string()];
    }

    let chars: Vec<char> = block.chars().collect();
    let max_chars = max_chars.max(1);
    let overlap_chars = overlap_chars.min(max_chars.saturating_sub(1));

    let mut parts: Vec<String> = vec![];
    let mut start: usize = 0;
    while start < chars.len() {
        let end = (start + max_chars).min(chars.len());
        let part: String = chars[start..end].iter().collect();
        if !part.trim().is_empty() {
            parts.push(part);
        }

        if end == chars.len() {
            break;
        }

        start = end.saturating_sub(overlap_chars);
        if start == end {
            break;
        }
    }

    parts
}

pub(crate) fn chunk_recursive_markdown(text: &str) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return vec![];
    }

    let mut blocks: Vec<String> = vec![];
    for block in split_markdown_blocks(text) {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }

        for part in split_long_block(
            block,
            DEFAULT_CHUNK_MAX_CHARS,
            DEFAULT_LONG_BLOCK_OVERLAP_CHARS,
        ) {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            blocks.push(part.to_string());
        }
    }

    if blocks.is_empty() {
        return vec![];
    }

    let mut chunks: Vec<String> = vec![];
    let mut i: usize = 0;
    while i < blocks.len() {
        let chunk_start = i;
        let mut chunk_blocks: Vec<String> = vec![];
        let mut len: usize = 0;

        while i < blocks.len() {
            let block = &blocks[i];
            let block_len = char_len(block);
            let add_len = if chunk_blocks.is_empty() {
                block_len
            } else {
                // "\n\n"
                2 + block_len
            };

            if !chunk_blocks.is_empty() && len + add_len > DEFAULT_CHUNK_MAX_CHARS {
                break;
            }

            chunk_blocks.push(block.clone());
            len += add_len;
            i += 1;
        }

        if chunk_blocks.is_empty() {
            // Force progress.
            chunk_blocks.push(blocks[i].clone());
            i += 1;
        }

        let chunk = chunk_blocks.join("\n\n").trim().to_string();
        if !chunk.is_empty() {
            chunks.push(chunk);
        }

        if i >= blocks.len() {
            break;
        }

        let overlap = DEFAULT_CHUNK_OVERLAP_BLOCKS.min(chunk_blocks.len().saturating_sub(1));
        i = (chunk_start + chunk_blocks.len()).saturating_sub(overlap);
    }

    chunks
}
