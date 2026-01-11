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
    statements.push(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`); // For gen_random_uuid() if pg < 13

    // 2. Process each table
    for (const [tableName, table] of Object.entries(schema.tables)) {
      const vTable = table as VTable<any>;
      const columns: string[] = [
        `"_id" UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
        `"_created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,
      ];

      const vectorIndexes: string[] = [];

      for (const [fieldName, field] of Object.entries(vTable.shape)) {
        try {
          const def = this.getFieldDefinition(field as VType<any>);

          // Add main column (data)
          columns.push(`"${fieldName}" ${def.type}`);

          // Add sidecar vector column if it's an embedding
          if (def.isVector) {
            const vectorColName = `${fieldName}_embedding`;
            columns.push(`"${vectorColName}" vector(${def.vectorDim})`);

            // Add HNSW index for fast similarity search
            // using cosine distance (vector_cosine_ops)
            vectorIndexes.push(
              `CREATE INDEX IF NOT EXISTS "idx_${tableName}_${fieldName}_vec" ON "${tableName}" USING hnsw ("${vectorColName}" vector_cosine_ops);`
            );
          }
        } catch (e) {
          console.warn(
            `Skipping field ${fieldName} in table ${tableName}: ${e}`
          );
        }
      }

      const createTableSql = `
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          ${columns.join(",\n          ")}
        );
      `;

      statements.push(createTableSql);
      statements.push(...vectorIndexes);
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
