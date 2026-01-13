import * as arrow from "apache-arrow";
import { VexiSchema } from "./validator.js";

export function toArrowSchema(schema: VexiSchema): arrow.Schema {
  const fields: arrow.Field[] = [];

  for (const [name, field] of Object.entries(schema)) {
    let type: arrow.DataType;

    if (field.kind === "string") {
      type = new arrow.Utf8();
    } else if (field.kind === "number") {
      type = new arrow.Float64();
    } else if (field.kind === "boolean") {
      type = new arrow.Bool();
    } else {
      throw new Error(`Unsupported field kind: ${field.kind}`);
    }

    fields.push(new arrow.Field(name, type, field.isOptional));
  }

  return new arrow.Schema(fields);
}
