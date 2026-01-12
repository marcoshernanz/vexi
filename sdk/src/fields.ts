export abstract class Field<Result> {
  readonly _result!: Result;
  readonly isVexiField = true;

  constructor(readonly isOptional: boolean = false) {}
}

export class BooleanField extends Field<boolean> {
  constructor() {
    super(false);
  }
}

export class NumberField extends Field<number> {
  constructor() {
    super(false);
  }
}

export class StringField extends Field<string> {
  constructor() {
    super(false);
  }
}

export class OptionalField<T extends Field<any>> extends Field<
  T["_result"] | undefined
> {
  constructor(readonly field: T) {
    super(true);
  }
}

export const v = {
  boolean: () => new BooleanField(),
  number: () => new NumberField(),
  string: () => new StringField(),
  optional: <T extends Field<any>>(
    field: T extends OptionalField<any> ? never : T,
  ): OptionalField<T> => {
    return new OptionalField(field) as any;
  },
};
