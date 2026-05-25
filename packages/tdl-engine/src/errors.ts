/** Base class for every error thrown by `@tallymcp/tdl-engine`. */
export class TdlEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TdlEngineError";
  }
}

/** Thrown when a `<ROW>` is missing a column declared in the catalog schema. */
export class TdlSchemaMismatchError extends TdlEngineError {
  constructor(
    public readonly reportName: string,
    public readonly missingFields: string[],
    public readonly rowIndex: number,
  ) {
    super(
      `Row ${rowIndex} of report "${reportName}" is missing fields: ${missingFields.join(", ")}`,
    );
    this.name = "TdlSchemaMismatchError";
  }
}

/** Thrown when Tally returns an `<EXCEPTION>` wrapper instead of `<DATA>`. */
export class TdlExceptionError extends TdlEngineError {
  constructor(public readonly tallyMessage: string) {
    super(`Tally returned <EXCEPTION>: ${tallyMessage}`);
    this.name = "TdlExceptionError";
  }
}
