export type EmbeddingOptions = {
  model?: string;
  strategy?: "recursive-markdown" | (string & {});
};

/**
 * Base class for all Vexi fields.
 * @template Result The TypeScript type that this field represents.
 */
export abstract class Field<Result> {
  /**
   * Phantom property used for TypeScript type inference.
   * This property does not exist at runtime.
   * @internal
   */
  declare protected readonly _result: Result;

  /**
   * Runtime flag to identify Vexi Field instances.
   * @internal
   */
  readonly isVexiField = true;

  constructor(
    /** @internal */
    readonly kind: string,
    /** @internal */
    readonly isOptional = false,
  ) {}

  /** @internal */
  toJSON(): Record<string, unknown> {
    return {
      kind: this.kind,
      isOptional: this.isOptional,
    };
  }
}

/**
 * Represents a boolean field.
 */
export class BooleanField extends Field<boolean> {
  constructor() {
    super("boolean", false);
  }
}

/**
 * Represents a numeric field.
 */
export class NumberField extends Field<number> {
  constructor() {
    super("number", false);
  }
}

/**
 * Represents a string field.
 */
export class StringField extends Field<string> {
  private embeddingConfig?: EmbeddingOptions;

  constructor() {
    super("string", false);
  }

  /**
   * Configures this field to be embedded.
   * @param options Configuration for the embedding model and strategy.
   */
  embed(options?: EmbeddingOptions): this {
    this.embeddingConfig = options ?? {};
    return this;
  }

  /** @internal */
  override toJSON() {
    return {
      ...super.toJSON(),
      ...(this.embeddingConfig ? { embedding: this.embeddingConfig } : {}),
    };
  }
}

/**
 * Wrapper for optional fields.
 */
export class OptionalField<T extends Field<unknown>> extends Field<
  T extends Field<infer R> ? R | undefined : never
> {
  constructor(
    /** @internal */
    readonly field: T,
  ) {
    super(field.kind, true);
  }

  /** @internal */
  override toJSON() {
    return {
      ...super.toJSON(),
      // Forward the wrapped field's configuration
      ...(this.field instanceof StringField ? this.field.toJSON() : {}),
      // Ensure correct kind and isOptional from this wrapper overwrite the child's
      kind: this.field.kind,
      isOptional: true,
    };
  }
}

/**
 * Builder object for defining schema fields.
 */
export const v = {
  boolean: () => new BooleanField(),
  number: () => new NumberField(),
  string: () => new StringField(),
  /**
   * Marks a field as optional.
   * @param field The field to make optional.
   */
  optional: <T extends Field<unknown>>(
    field: T extends OptionalField<Field<unknown>> ? never : T,
  ): OptionalField<T> => {
    return new OptionalField(field);
  },
};
