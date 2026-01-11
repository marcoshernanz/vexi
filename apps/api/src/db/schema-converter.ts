import {
  VSchema,
  VTable,
  VType,
  VString,
  VStringOptional,
  VNumber,
  VNumberOptional,
  VBoolean,
  VBooleanOptional,
  VText,
  VOptionalText,
  VEmbeddedText,
  VOptionalEmbeddedText,
  getEmbedConfig,
} from "vexi";

interface ColumnDef {
  name: string;
  type: string;
  isVector?: boolean;
  vectorDim?: number;
}

export class SchemaConverter {
  static toSQL(schema: VSchema<any>): string[] {
    const statements: string[] = [];

    // 1. Ensure extensions exist
    statements.push(`CREATE EXTENSION IF NOT EXISTS vector;`);
    statements.push(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 2. Process each table
    for (const [tableName, table] of Object.entries(schema.tables)) {
      const vTable = table as VTable<any>;
      const columns: string[] = [
        `"_id" UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
        `"_created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,
      ];

      const extraTables: string[] = [];

      for (const [fieldName, field] of Object.entries(vTable.shape)) {
        try {
          const def = this.getFieldDefinition(field as VType<any>);

          // Add main column (data)
          columns.push(`"${fieldName}" ${def.type}`);

          // Create separate embedding table if it's an embedding field
          if (def.isVector) {
            const embedTableName = `${tableName}_embeddings`;

            // Embeddings Table:
            // - id: PK
            // - parent_id: FK to main table
            // - chunk_index: Order of chunk
            // - chunk_text: Content of chunk (for FTS)
            // - embedding: Vector

            const createEmbedTable = `
              CREATE TABLE IF NOT EXISTS "${embedTableName}" (
                "id" BIGSERIAL PRIMARY KEY,
                "parent_id" UUID NOT NULL REFERENCES "${tableName}"("_id") ON DELETE CASCADE,
                "chunk_index" INTEGER NOT NULL,
                "chunk_text" TEXT NOT NULL,
                "embedding" vector(${def.vectorDim})
              );
            `;

            extraTables.push(createEmbedTable);

            // Vector Index
            extraTables.push(
              `CREATE INDEX IF NOT EXISTS "idx_${embedTableName}_vec" ON "${embedTableName}" USING hnsw ("embedding" vector_cosine_ops);`
            );

            // Full Text Search Index
            // We index the chunk_text using GIN for fast keyword search
            extraTables.push(
              `CREATE INDEX IF NOT EXISTS "idx_${embedTableName}_fts" ON "${embedTableName}" USING GIN (to_tsvector('english', "chunk_text"));`
            );
          }
        } catch (e) {
          console.warn(
            `Skipping field ${fieldName} in table ${tableName}: ${e}`
          );
        }
      }

      // Create Main Table
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          ${columns.join(",\n          ")}
        );
      `;

      statements.push(createTableSql);

      // Create Embeddings Tables (must come after main table creation)
      statements.push(...extraTables);
    }

    return statements;
  }

  private static getFieldDefinition(type: VType<any>): ColumnDef {
    // String Types
    if (type instanceof VString) return { name: "", type: "TEXT NOT NULL" };
    if (type instanceof VStringOptional) return { name: "", type: "TEXT" };
    if (type instanceof VText) return { name: "", type: "TEXT NOT NULL" };
    if (type instanceof VOptionalText) return { name: "", type: "TEXT" };

    // Number Types
    if (type instanceof VNumber)
      return { name: "", type: "DOUBLE PRECISION NOT NULL" };
    if (type instanceof VNumberOptional)
      return { name: "", type: "DOUBLE PRECISION" };

    // Boolean Types
    if (type instanceof VBoolean) return { name: "", type: "BOOLEAN NOT NULL" };
    if (type instanceof VBooleanOptional) return { name: "", type: "BOOLEAN" };

    // Embedded Types
    if (
      type instanceof VEmbeddedText ||
      type instanceof VOptionalEmbeddedText
    ) {
      const config = getEmbedConfig(type);
      const isOptional = type instanceof VOptionalEmbeddedText;
      return {
        name: "", // handled by caller
        type: isOptional ? "TEXT" : "TEXT NOT NULL",
        isVector: true,
        vectorDim: config?.dimensions || 1536,
      };
    }

    throw new Error(`Unknown field type encountered: ${type.constructor.name}`);
  }
}
