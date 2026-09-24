/**
 * The one-line acknowledgement the flag sheet leaves behind («ثبت شد»).
 *
 * Deliberately not a `ui/` primitive: the review screen is the only place in the app that
 * confirms something without changing what is on screen, and a shared toast system would be a
 * provider, a queue and a portal for one caller. If a second screen ever needs one, it moves.
 */

export interface ToastProps {
  readonly message: string;
}

export function Toast({ message }: ToastProps) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4"
      data-testid="review-toast"
    >
      <span className="rounded-[var(--radius-pill)] bg-[var(--fg)] px-4 py-2 text-body-sm text-[var(--bg)] shadow-sm">
        {message}
      </span>
    </div>
  );
}
