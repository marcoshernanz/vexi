// src/fields.ts
var DEFAULT_EMBED_CONFIG = {
  model: "openai/text-embedding-3-small",
  strategy: "recursive-markdown",
  dimensions: 1536
};
var EMBED_CONFIG_KEY = /* @__PURE__ */ Symbol("vexi.embedConfig");
var VType = class {
};
var VOptionalableType = class extends VType {
};
var VString = class extends VOptionalableType {
  optional() {
    return new VStringOptional();
  }
};
var VStringOptional = class extends VType {
};
var VNumber = class extends VOptionalableType {
  optional() {
    return new VNumberOptional();
  }
};
var VNumberOptional = class extends VType {
};
var VBoolean = class extends VOptionalableType {
  optional() {
    return new VBooleanOptional();
  }
};
var VBooleanOptional = class extends VType {
};
var VText = class extends VOptionalableType {
  embed(config = DEFAULT_EMBED_CONFIG) {
    return new VEmbeddedText(config);
  }
  optional() {
    return new VOptionalText();
  }
};
var VOptionalText = class extends VType {
  embed(config = DEFAULT_EMBED_CONFIG) {
    return new VOptionalEmbeddedText(config);
  }
};
var VEmbeddedText = class extends VType {
  constructor(config) {
    super();
    this[EMBED_CONFIG_KEY] = config;
  }
};
var VOptionalEmbeddedText = class extends VType {
  constructor(config) {
    super();
    this[EMBED_CONFIG_KEY] = config;
  }
};
var v = {
  string: () => new VString(),
  boolean: () => new VBoolean(),
  number: () => new VNumber(),
  text: () => new VText()
};
function getEmbedConfig(type) {
  return type[EMBED_CONFIG_KEY];
}

// src/schema.ts
var VTable = class {
  constructor(shape) {
    this.shape = shape;
  }
};
var VSchema = class {
  constructor(tables) {
    this.tables = tables;
  }
};
function defineTable(shape) {
  return new VTable(shape);
}
function defineSchema(tables) {
  return new VSchema(tables);
}

// src/client.ts
async function postJson(fetcher, url, body, headers) {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${await response.text()}`
    );
  }
  const text = await response.text();
  return text ? JSON.parse(text) : void 0;
}
function createClient(config) {
  const apiUrl = (config.apiUrl ?? "http://localhost:3000").replace(/\/$/, "");
  const fetcher = config.fetch ?? globalThis.fetch;
  if (!fetcher) throw new Error("No fetch implementation found.");
  const headers = {
    ...config.headers ?? {},
    ...config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}
  };
  const client = {};
  for (const tableName of Object.keys(config.schema.tables)) {
    const tableDef = config.schema.tables[tableName];
    let embedConfig = null;
    for (const [key, field] of Object.entries(tableDef.shape)) {
      const conf = getEmbedConfig(field);
      if (conf) {
        embedConfig = { field: key, ...conf };
        break;
      }
    }
    client[tableName] = {
      insert: async (data, options) => {
        return postJson(
          fetcher,
          `${apiUrl}/insert`,
          { tableName, data, embedConfig },
          headers
        );
      },
      search: async (query, options) => {
        const results = await postJson(
          fetcher,
          `${apiUrl}/search`,
          { tableName, query, limit: options?.limit },
          headers
        );
        return results.map((result) => {
          const { _id, _score, _match_text, ...rest } = result;
          return rest;
        });
      }
    };
  }
  return client;
}
export {
  VBoolean,
  VBooleanOptional,
  VEmbeddedText,
  VNumber,
  VNumberOptional,
  VOptionalEmbeddedText,
  VOptionalText,
  VOptionalableType,
  VSchema,
  VString,
  VStringOptional,
  VTable,
  VText,
  VType,
  createClient,
  defineSchema,
  defineTable,
  getEmbedConfig,
  v
};
