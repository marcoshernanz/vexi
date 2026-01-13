import { z } from "zod";

export const FieldSchema = z.object({
  kind: z.enum(["string", "number", "boolean"]),
  isOptional: z.boolean(),
});

export const TableSchema = z.record(z.string(), FieldSchema);

export const CreateTableSchema = z.object({
  name: z.string().min(1),
  schema: TableSchema,
});

export type VexiField = z.infer<typeof FieldSchema>;
export type VexiSchema = z.infer<typeof TableSchema>;
