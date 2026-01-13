import Fastify, { FastifyRequest, FastifyReply } from "fastify";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";
import * as path from "path";

const fastify = Fastify({
  logger: true,
});

const dbDir = path.join(process.cwd(), ".lancedb");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const db = await lancedb.connect(dbDir);
fastify.log.info(`Connected to LanceDB at ${dbDir}`);

fastify.get("/", async (request, reply) => {
  return { hello: "world" };
});

fastify.post<{ Body: { name: string; schema: any } }>(
  "/tables",
  async (request, reply) => {
    console.log(request.body);
  },
);

try {
  await fastify.listen({ port: 3000 });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
