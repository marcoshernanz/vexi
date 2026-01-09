export class VexiError extends Error {
  override name = "VexiError";

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    // Fix prototype chain when targeting ES5/ES2020 with transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VexiConfigError extends VexiError {
  override name = "VexiConfigError";
}

export class VexiUnknownTableError extends VexiError {
  override name = "VexiUnknownTableError";

  constructor(tableName: string, availableTables: readonly string[]) {
    const available = availableTables.length
      ? availableTables.join(", ")
      : "(none)";
    super(`Unknown table \"${tableName}\". Available tables: ${available}`);
  }
}

export class VexiHttpError extends VexiError {
  override name = "VexiHttpError";

  constructor(
    message: string,
    public readonly info: {
      url: string;
      status: number;
      statusText: string;
      bodyText?: string;
    }
  ) {
    super(message);
  }
}

export class VexiResponseError extends VexiError {
  override name = "VexiResponseError";

  constructor(
    message: string,
    public readonly info: { url: string; bodyText?: string }
  ) {
    super(message);
  }
}
