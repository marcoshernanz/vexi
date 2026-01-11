import type { EmbedConfig } from "./config";

export type InferOutput<T extends VType<any>> = T extends VType<infer Output>
  ? Output
  : never;

const EMBED_CONFIG = new WeakMap<object, EmbedConfig>();
const OPTIONAL_INNER = new WeakMap<object, VType<any>>();

const DEFAULT_EMBED_CONFIG: EmbedConfig = {
  model: "openai/text-embedding-3-small",
  strategy: "recursive-markdown",
};

// Generic <Output> tells TypeScript what this field resolves to (e.g., string)
export abstract class VType<Output = unknown> {
  // Hidden phantom field to anchor Output for type inference (not accessible to consumers).
  protected declare readonly __vexiOutputBrand: Output;
}

abstract class VOptionalableType<Output> extends VType<Output> {
  optional(): VOptional<this> {
    return new VOptional(this);
  }
}

export class VOptional<Inner extends VType<any>> extends VType<
  InferOutput<Inner> | undefined
> {
  // Hidden brand so non-optional fields don't structurally match VOptional.
  private declare readonly __vexiOptionalBrand: true;

  constructor(inner: Inner) {
    super();
    OPTIONAL_INNER.set(this, inner);
  }
}

export class VString extends VOptionalableType<string> {}

export class VBoolean extends VOptionalableType<boolean> {}

export class VNumber extends VOptionalableType<number> {}

// --- VText and variants for chaining ---

export class VEmbeddedText extends VType<string> {}

export class VOptionalEmbeddedText extends VOptional<VText> {}

export class VOptionalText extends VOptional<VText> {
  embed(config: EmbedConfig = DEFAULT_EMBED_CONFIG): VOptionalEmbeddedText {
    const inner = OPTIONAL_INNER.get(this) as VText;
    const embedded = new VOptionalEmbeddedText(inner);
    EMBED_CONFIG.set(embedded, config);
    return embedded;
  }
}

export class VText extends VType<string> {
  /**
   * Marks this field to be automatically embedded by the vector database.
   */
  embed(config: EmbedConfig = DEFAULT_EMBED_CONFIG): VEmbeddedText {
    const embedded = new VEmbeddedText();
    EMBED_CONFIG.set(embedded, config);
    return embedded;
  }

  optional(): VOptionalText {
    return new VOptionalText(this);
  }
}

/** @internal */
export function getEmbedConfig(type: VType<any>): EmbedConfig | undefined {
  let current: VType<any> = type;

  // Check eagerly at top level
  let config = EMBED_CONFIG.get(current as unknown as object);
  if (config) return config;

  while (current instanceof VOptional) {
    const inner = OPTIONAL_INNER.get(current as unknown as object);
    if (!inner) break;
    current = inner;

    config = EMBED_CONFIG.get(current as unknown as object);
    if (config) return config;
  }

  return undefined;
}

export const v = {
  string: () => new VString(),
  boolean: () => new VBoolean(),
  number: () => new VNumber(),
  text: () => new VText(),
} as const;
