/** Base class for every error thrown by `@tallymcp/tally-xml`. */
export class TallyXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TallyXmlError";
  }
}

/** Thrown when a string cannot be parsed as a Tally amount. */
export class TallyAmountParseError extends TallyXmlError {
  constructor(
    /** The original string that failed to parse. */
    public readonly input: string,
  ) {
    super(`Cannot parse Tally amount: "${input}"`);
    this.name = "TallyAmountParseError";
  }
}
