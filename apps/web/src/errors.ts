/**
 * The one error type the app throws (`what.md` §17.4).
 *
 * Every `catch` in this codebase either handles a named `code` or reports and rethrows; nothing
 * is ever swallowed. The code is a stable ASCII string so a `client_errors` record (§10.1) can
 * be grouped by it without matching on a Persian message.
 */

export class AppError extends Error {
  readonly code: string;
  readonly data: unknown;

  constructor(code: string, message: string, data?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.data = data;
  }
}

/** Narrowing helper, so a `catch (err: unknown)` can branch on the code without a cast. */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Turns anything a `catch` can receive into an `AppError` with the given fallback code. */
export function toAppError(err: unknown, fallbackCode: string): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) return new AppError(fallbackCode, err.message, { stack: err.stack });
  return new AppError(fallbackCode, String(err));
}
