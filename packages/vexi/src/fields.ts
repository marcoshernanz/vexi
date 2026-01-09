import type { EmbedConfig } from "./config";

export type InferOutput<T extends VType<any>> = T["_output"];

// Generic <Output> tells TypeScript what this field resolves to (e.g., string)
export abstract class VType<Output = unknown> {
  abstract readonly _type: string;

  // "Phantom" property. It doesn't exist at runtime,
  // but TS uses it to store the inferred type.
  declare readonly _output: Output;

  optional(): VOptional<this> {
    return new VOptional(this);
  }

  nullable(): VNullable<this> {
    return new VNullable(this);
  }

  /** @internal */
  _getEmbedConfig(): EmbedConfig | undefined {
    return undefined;
  }
}

export class VOptional<Inner extends VType<any>> extends VType<
  InferOutput<Inner> | undefined
> {
  readonly _type = "optional" as const;

  constructor(public readonly inner: Inner) {
    super();
  }

  override _getEmbedConfig(): EmbedConfig | undefined {
    return this.inner._getEmbedConfig();
  }
}

export class VNullable<
  Inner extends VType<any>
> extends VType<InferOutput<Inner> | null> {
  readonly _type = "nullable" as const;

  constructor(public readonly inner: Inner) {
    super();
  }

  override _getEmbedConfig(): EmbedConfig | undefined {
    return this.inner._getEmbedConfig();
  }
}

export class VString extends VType<string> {
  readonly _type = "string" as const;
}

export class VBoolean extends VType<boolean> {
  readonly _type = "boolean" as const;
}

export class VNumber extends VType<number> {
  readonly _type = "number" as const;
}

export class VText extends VType<string> {
  readonly _type = "text" as const;

  // Internal metadata storage
  private _embedConfig?: EmbedConfig;

  /**
   * Marks this field to be automatically embedded by the vector database.
   */
  embed(config: EmbedConfig): this {
    this._embedConfig = config;
    return this; // Return 'this' to allow chaining
  }

  override _getEmbedConfig(): EmbedConfig | undefined {
    return this._embedConfig;
  }
}

export const v = {
  string: () => new VString(),
  boolean: () => new VBoolean(),
  number: () => new VNumber(),
  text: () => new VText(),
} as const;
