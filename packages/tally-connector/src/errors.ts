export class TallyHttpError extends Error {
  constructor(
    message: string,
    public readonly meta: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TallyHttpError";
  }
}
