/** Minimal interface implemented by `TallyHttpClient` (and test stubs). */
export interface TallyClient {
  post(xml: string): Promise<string>;
}
