/**
 * Base class for all Vexi fields.
 * @template Result The TypeScript type that this field represents.
 */
export abstract class Field<Result> {
  /**
   * Phantom property used for TypeScript type inference.
   * This property does not exist at runtime.
   */
  readonly _result!: Result;

  /**
   * Runtime flag to identify Vexi Field instances.
   */
  readonly isVexiField = true;

  constructor(readonly isOptional: boolean = false) {}
}

/**
 * Represents a boolean field.
 */
export class BooleanField extends Field<boolean> {
  constructor() {
    super(false);
  }
}

/**
 * Represents a numeric field.
 */
export class NumberField extends Field<number> {
  constructor() {
    super(false);
  }
}

/**
 * Represents a string field.
 */
export class StringField extends Field<string> {
  constructor() {
    super(false);
  }
}

/**
 * Wrapper for optional fields.
 */
export class OptionalField<T extends Field<any>> extends Field<
  T["_result"] | undefined
> {
  constructor(readonly field: T) {
    super(true);
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
  optional: <T extends Field<any>>(
    field: T extends OptionalField<any> ? never : T,
  ): OptionalField<T> => {
    return new OptionalField(field) as any;
  },
};
