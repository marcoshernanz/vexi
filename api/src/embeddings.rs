use serde_json::{json, Value};

/// Generates embeddings for a batch of text using the OpenAI API.
pub async fn generate_embeddings(
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
