import * as arrow from "apache-arrow";
import { VexiSchema } from "./validator.js";

/**
 * Converts a validated Vexi Schema object into an Apache Arrow Schema.
 *
 * LanceDB relies on Apache Arrow for its internal columnar storage format.
 * This function translates the high-level Vexi types into their corresponding
 * Arrow DataType definitions.
 *
 * Mappings:
 * - "string"  -> arrow.Utf8
 * - "number"  -> arrow.Float64 (Standard JS number is double precision)
 * - "boolean" -> arrow.Bool
 *
 * @param schema - The Vexi schema object (dictionary of fields) to convert.
 * @returns An `arrow.Schema` instance representing the table structure.
 * @throws {Error} If an unknown field kind is encountered (should be caught by Zod validation first).
 */
export function toArrowSchema(schema: VexiSchema): arrow.Schema {
  const fields: arrow.Field[] = [];

  for (const [name, field] of Object.entries(schema)) {
    let type: arrow.DataType;

    if (field.kind === "string") {
      type = new arrow.Utf8();
    } else if (field.kind === "number") {
      type = new arrow.Float64();
    } else {
      type = new arrow.Bool();
    }

    fields.push(new arrow.Field(name, type, field.isOptional));
  }

  return new arrow.Schema(fields);
}
