-- Enable the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the table for raw document storage
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    table_name TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the table for embeddings (Vectors)
CREATE TABLE search_index (
    id BIGSERIAL PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    chunk_text TEXT NOT NULL,
    
    -- 1536 dimensions is standard for OpenAI text-embedding-3-small
    embedding vector(1536)
);

-- Add an HNSW index for fast similarity search
CREATE INDEX idx_embedding ON search_index USING hnsw (embedding vector_cosine_ops);