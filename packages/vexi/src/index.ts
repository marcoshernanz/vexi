export type { EmbeddingModel, ChunkingStrategy, EmbedConfig } from "./config";

export {
  VType,
  VOptional,
  VNullable,
  VString,
  VBoolean,
  VNumber,
  VText,
  v,
} from "./fields";

export {
  VTable,
  VSchema,
  defineTable,
  defineSchema,
  type TableShape,
  type InferDoc,
  type InferSchema,
} from "./schema";

export {
  createClient,
  type SearchResult,
  type RequestOptions,
  type SearchOptions,
  type InsertOptions,
  type InsertResult,
  type TableClient,
  type VexiClient,
  type ClientConfig,
  type VexiClientHelpers,
} from "./client";

export {
  VexiError,
  VexiConfigError,
  VexiUnknownTableError,
  VexiHttpError,
  VexiResponseError,
} from "./errors";
