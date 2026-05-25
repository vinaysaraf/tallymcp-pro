/** Minimal interface implemented by `TallyHttpClient` (and test stubs). */
export interface TallyClient {
  post(
    xml: string,
    options?: { charset?: "utf-16" | "utf-8" },
  ): Promise<string>;
}
