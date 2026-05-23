import { TallyHttpError } from "./errors.js";

export function isConnectionRefused(err: unknown): boolean {
  if (err instanceof Error && "code" in err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "ECONNREFUSED" || code === "ECONNRESET";
  }
  return false;
}

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    if (
      err.name === "HeadersTimeoutError" ||
      err.name === "BodyTimeoutError" ||
      err.name === "ConnectTimeoutError"
    ) {
      return true;
    }
    if ("code" in err) {
      const code = (err as { code: string }).code;
      return (
        code === "UND_ERR_HEADERS_TIMEOUT" ||
        code === "UND_ERR_BODY_TIMEOUT" ||
        code === "UND_ERR_CONNECT_TIMEOUT"
      );
    }
  }
  return false;
}

export function connectionErrorMessage(err: unknown): string {
  if (err instanceof TallyHttpError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
