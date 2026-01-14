/**
 * Main entry point for the Vexi API server.
 *
 * This server is built with Fastify and serves as the bridge between the user's
 * SDK client and the underlying LanceDB storage engine. It handles schema synchronization,
 * table creation, and data operations.
 */
import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";
import * as path from "path";
import { CreateTableSchema, VexiSchema } from "./validator.js";
import { toArrowSchema } from "./schema.js";

const fastify = Fastify({
  logger: true,
});

const dbDir = path.join(process.cwd(), ".lancedb");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const db = await lancedb.connect(dbDir);
fastify.log.info(`Connected to LanceDB at ${dbDir}`);

/**
 * Health check endpoint.
 */
fastify.get("/", async (request, reply) => {
  return { hello: "world" };
});

/**
 * List all tables.
 * Returns an array of table names currently existing in the LanceDB database.
 */
fastify.get("/tables", async (request, reply) => {
  const tables = await db.tableNames();
  return { tables };
});

/**
 * Get table details.
 * Retrieves the schema and metadata for a specific table by name.
 *
 * @param name - The name of the table to retrieve.
 * @returns The table schema if found, or a 404 error.
 */
fastify.get<{ Params: { name: string } }>(
  "/tables/:name",
  async (request, reply) => {
    const { name } = request.params;
    try {
      const table = await db.openTable(name);
      const schema = await table.schema();
      return { name, schema };
    } catch (e) {
      return reply.code(404).send({ error: "Table not found" });
    }
  },
);

/**
 * Create a new table.
 *
 * Accepts a table name and a Vexi schema definition. Validates the schema using Zod,
 * converts it to an Arrow schema, and creates the table in LanceDB.
 *
 * If the table already exists, it currently logs the event and skips creation
 * (idempotent behavior for identical schemas).
 *
 * @body name - The name of the table.
 * @body schema - The schema definition object.
 */
fastify.post<{ Body: { name: string; schema: VexiSchema } }>(
  "/tables",
  async (request, reply) => {
    const result = CreateTableSchema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({ error: result.error.format() });
    }

    const { name, schema } = result.data;

    try {
      const arrowSchema = toArrowSchema(schema);
      const existingTables = await db.tableNames();

      if (existingTables.includes(name)) {
        // Check if table exists
        // TODO: Validate if schema matches existing table
        fastify.log.info(`Table '${name}' already exists.`);
        return { success: true, action: "skipped", name };
      }

      await db.createTable(name, [], { schema: arrowSchema });
      fastify.log.info(`Created table '${name}'`);

      return { success: true, action: "created", name };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to create table" });
    }
  },
);

try {
  await fastify.listen({ port: 3000 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
