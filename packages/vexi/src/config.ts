// Configuration & Embedding Metadata

export type EmbeddingModel =
  | "openai/text-embedding-3-small"
  | "openai/text-embedding-3-large"
  | "cohere/embed-english-v3.0"
  | (string & {}); // Allow custom strings while keeping autocomplete

export type ChunkingStrategy =
  | "recursive-markdown"
  | "paragraph"
  | "sentence"
  | (string & {});

export interface EmbedConfig {
  model: EmbeddingModel;
  strategy: ChunkingStrategy;
}

// Internal wire shape sent to the API insert endpoint.
export interface WireEmbedConfig extends EmbedConfig {
  field: string;
}
