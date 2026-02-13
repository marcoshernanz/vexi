use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Content {
    pub parts: Vec<Part>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Part {
    pub text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Embedding {
    pub values: Vec<f32>,
}

/// Generates embeddings for a batch of text using the Gemini API.
///
/// `model` must be a Gemini model resource name like: `models/text-embedding-004`.
pub async fn generate_embeddings(
    texts: &[String],
    model: &str,
    api_key: &str,
) -> Result<Vec<Vec<f32>>, String> {
    if api_key.trim().is_empty() {
        return Err("Missing Gemini API key (set GEMINI_API_KEY)".to_string());
    }

    let model = model.trim();
    if !model.starts_with("models/") {
        return Err(format!(
            "Invalid Gemini model \"{}\" (expected resource name like models/text-embedding-004)",
            model
        ));
    }

    if texts.is_empty() {
        return Ok(vec![]);
    }

    let client = Client::new();
    let base_url = format!(
        "https://generativelanguage.googleapis.com/v1beta/{}:batchEmbedContents",
        model
    );
    let mut url = Url::parse(&base_url).map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("key", api_key);

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct BatchEmbedContentsRequest {
        pub requests: Vec<EmbedContentRequestWithModel>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct EmbedContentRequestWithModel {
        pub model: String,
        pub content: Content,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BatchEmbedContentsResponse {
        pub embeddings: Vec<Embedding>,
    }

    let req = BatchEmbedContentsRequest {
        requests: texts
            .iter()
            .map(|t| EmbedContentRequestWithModel {
                model: model.to_string(),
                content: Content {
                    parts: vec![Part { text: t.clone() }],
                },
            })
            .collect(),
    };

    let res = client
        .post(url)
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        return Err(format!("Gemini API error: {}", error_text));
    }

    let body: BatchEmbedContentsResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(body.embeddings.into_iter().map(|e| e.values).collect())
}
