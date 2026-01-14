/**
 * Main entry point for the Vexi API server.
 *
 * This server is built with Fastify and serves as the bridge between the user's
 * SDK client and the underlying LanceDB storage engine. It handles schema synchronization,
 * table creation, and data operations.
 */
import Fastify from "fastify";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import {
  CreateTableSchema,
  InsertBodySchema,
  InsertParamsSchema,
  VexiSchema,
} from "./validator.js";
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
      return reply.code(400).send({ error: z.treeifyError(result.error) });
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

/**
 * Insert data into a table.
 *
 * Accepts a table name and an array of records to insert.
 *
 * @param name - The name of the table.
 * @body - The array of records to insert.
 */
fastify.post<{
  Params: { name: string };
  Body: Record<string, unknown>[];
}>(
  "/tables/:name/insert",
  async (request, reply) => {
    const paramsResult = InsertParamsSchema.safeParse(request.params);
    const bodyResult = InsertBodySchema.safeParse(request.body);

    if (!paramsResult.success) {
      return reply.code(400).send({ error: z.treeifyError(paramsResult.error) });
    }
    if (!bodyResult.success) {
      return reply.code(400).send({ error: z.treeifyError(bodyResult.error) });
    }

    const { name } = paramsResult.data;
    const data = bodyResult.data;

    try {
      const existingTables = await db.tableNames();
      if (!existingTables.includes(name)) {
        return await reply
          .code(404)
          .send({ error: `Table '${name}' does not exist.` });
      }

      const table = await db.openTable(name);
      await table.add(data);

      fastify.log.info(`Inserted ${String(data.length)} records into '${name}'`);
      return { success: true, count: data.length };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to insert data" });
    }
  },
);

try {
  await fastify.listen({ port: 3000 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
