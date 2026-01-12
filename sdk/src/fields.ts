export abstract class Validator<Type> {
  readonly type!: Type;
  readonly isVexiValidator = true;

  constructor(readonly isOptional: boolean = false) {}
}

export class VBoolean<Type = boolean> extends Validator<Type> {
  constructor() {
    super(false);
  }
}

export class VNumber<Type = number> extends Validator<Type> {
  constructor() {
    super(false);
  }
}

export class VString<Type = string> extends Validator<Type> {
  constructor() {
    super(false);
  }
}

export class VOptional<T extends Validator<any>> extends Validator<
  T["type"] | undefined
> {
  constructor(readonly validator: T) {
    super(true);
  }
}

export const v = {
  boolean: () => new VBoolean(),
  number: () => new VNumber(),
  string: () => new VString(),
  optional: <T extends Validator<any>>(
    value: T extends VOptional<any> ? never : T,
  ): VOptional<T> => {
    return new VOptional(value) as any;
  },
};
