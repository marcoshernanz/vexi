// --- Configuration ---

export interface EmbedConfig {
  model?: string;
  strategy?: string;
  dimensions?: number;
}

const DEFAULT_EMBED_CONFIG: EmbedConfig = {
  model: "openai/text-embedding-3-small",
  strategy: "recursive-markdown",
  dimensions: 1536,
};

// Internal symbol for storing config hidden from public API
const EMBED_CONFIG_KEY = Symbol("vexi.embedConfig");

// --- Base Types ---

export abstract class VType<Output> {
  // Use protected phantom property to ensure structural typing while hiding from autocomplete
  protected declare readonly _phantom: Output;
}

export abstract class VOptionalableType<Output> extends VType<Output> {
  abstract optional(): VType<Output | undefined>;
}

// --- Primitive Fields ---

export class VString extends VOptionalableType<string> {
  optional(): VStringOptional {
    return new VStringOptional();
  }
}
export class VStringOptional extends VType<string | undefined> {}

export class VNumber extends VOptionalableType<number> {
  optional(): VNumberOptional {
    return new VNumberOptional();
  }
}
export class VNumberOptional extends VType<number | undefined> {}

export class VBoolean extends VOptionalableType<boolean> {
  optional(): VBooleanOptional {
    return new VBooleanOptional();
  }
}
export class VBooleanOptional extends VType<boolean | undefined> {}

// --- Text Fields with Embedding ---

export class VText extends VOptionalableType<string> {
  embed(config: EmbedConfig = DEFAULT_EMBED_CONFIG): VEmbeddedText {
    return new VEmbeddedText(config);
  }
  optional(): VOptionalText {
    return new VOptionalText();
  }
}

export class VOptionalText extends VType<string | undefined> {
  embed(config: EmbedConfig = DEFAULT_EMBED_CONFIG): VOptionalEmbeddedText {
    return new VOptionalEmbeddedText(config);
  }
}

export class VEmbeddedText extends VType<string> {
  constructor(config: EmbedConfig) {
    super();
    // Store config hidden on symbol key
    (this as any)[EMBED_CONFIG_KEY] = config;
  }
}

export class VOptionalEmbeddedText extends VType<string | undefined> {
  constructor(config: EmbedConfig) {
    super();
    (this as any)[EMBED_CONFIG_KEY] = config;
  }
}

// --- Factory ---

export const v = {
  string: () => new VString(),
  boolean: () => new VBoolean(),
  number: () => new VNumber(),
  text: () => new VText(),
} as const;

// --- Helpers ---

export function getEmbedConfig(type: VType<any>): EmbedConfig | undefined {
  return (type as any)[EMBED_CONFIG_KEY];
}
