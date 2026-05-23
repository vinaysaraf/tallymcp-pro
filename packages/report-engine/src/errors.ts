/** Thrown when Tally returns `<LINEERROR>` messages for a report. */
export class TallyReportError extends Error {
  constructor(
    public readonly reportId: string,
    public readonly lineErrors: string[],
  ) {
    super(
      `Tally returned ${lineErrors.length} line error(s) for ${reportId}: ${lineErrors.join("; ")}`,
    );
    this.name = "TallyReportError";
  }
}
