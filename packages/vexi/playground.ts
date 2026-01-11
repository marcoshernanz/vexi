import {
  v,
  defineTable,
  defineSchema,
  createClient,
  InferDoc,
} from "./src/index";

const table = defineTable({
  stringField: v.string(),
  optionalField: v.string().optional(),
  textField: v.text().embed(),
  optionalTextField: v.text().optional().embed(),
  numberField: v.number(),
  booleanField: v.boolean(),
});

const schema = defineSchema({
  table,
});

const db = createClient({ schema });

type Table = InferDoc<typeof table>;

async function main() {
  await db.table.insert({
    stringField: "Rust Guide",
    optionalField: "Optional value",
    textField: "Rust is fast.",
    optionalTextField: "Optional text",
    numberField: 42,
    booleanField: true,
  });

  const results = await db.table.search("Is Rust fast?", { limit: 5 });
}

main();
