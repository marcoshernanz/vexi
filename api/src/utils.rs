use arrow_schema::{DataType, Field, Schema};
use serde_json::Value;

/// Infers an Arrow Schema from a JSON Value (assuming it's an object).
pub fn infer_schema_from_json(value: &Value) -> Result<Schema, String> {
    let obj = value.as_object().ok_or("Root must be object")?;
    let mut fields = vec![];

    for (k, v) in obj {
        let dt = match v {
            Value::String(_) => DataType::Utf8,
            Value::Number(n) => {
                if n.is_f64() {
                    DataType::Float64
                } else {
                    DataType::Int64
                }
            }
            Value::Bool(_) => DataType::Boolean,
            Value::Array(arr) => {
                // Check if it's a vector (array of numbers)
                if !arr.is_empty() && arr[0].is_number() {
                    // Fixed size list would be better for vectors, but List is safer for inference
                    // Using Float32 for vectors
                    DataType::new_list(DataType::Float32, true)
                } else {
                    DataType::Utf8 // Fallback for other arrays
                }
            }
            _ => DataType::Utf8,
        };
        fields.push(Field::new(k, dt, true));
    }

    Ok(Schema::new(fields))
}
