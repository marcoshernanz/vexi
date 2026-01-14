import { z } from "zod";

/**
 * Zod schema for a single field definition in the Vexi schema.
 * Validates the structure of a field object sent from the SDK.
 *
 * @property kind - The data type of the field (string, number, boolean).
 * @property isOptional - Helper flag indicating if the field can be undefined.
 */
export const FieldSchema = z.object({
  kind: z.enum(["string", "number", "boolean"]),
  isOptional: z.boolean(),
});

/**
 * Zod schema for a table definition.
 * A table is structurally a Record where keys are column names strings and values are `FieldSchema` objects.
 */
export const TableSchema = z.record(z.string(), FieldSchema);

/**
 * Zod schema for the Create Table request payload.
 * Used to validate the body of POST /tables requests.
 *
 * @property name - The unique name of the table to create.
 * @property schema - The structural definition of the table columns.
 */
export const CreateTableSchema = z.object({
  name: z.string().min(1),
  schema: TableSchema,
});

/**
 * Zod schema for the Insert Params.
 */
export const InsertParamsSchema = z.object({
  name: z.string().min(1),
});

/**
 * Zod schema for the Insert Body (Array of records).
 */
export const InsertBodySchema = z.array(z.record(z.string(), z.unknown()));

/**
 * Inferred TypeScript type for a Vexi Field.
 * Represents the shape of a field object at runtime after validation.
 */
export type VexiField = z.infer<typeof FieldSchema>;

/**
 * Inferred TypeScript type for a Vexi Table Schema.
 * Represents the shape of a table definition object at runtime.
 */
export type VexiSchema = z.infer<typeof TableSchema>;
