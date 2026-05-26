export interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

/**
 * Dismissible red banner shown below the StatusBanner when an IPC call
 * fails. The error message comes from `lastError` in the Zustand store.
 * Cleared automatically on screen navigation and on the next successful
 * IPC call (see `App.tsx` `navigateTo`/successful handlers).
 *
 * Added per Cursor review M1 — `lastError` was previously set but never
 * surfaced to the user.
 */
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps): JSX.Element {
  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-300 rounded-lg px-4 py-2 mb-4 text-sm text-red-900 flex items-center gap-3"
    >
      <span aria-hidden>⚠</span>
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="text-red-700 hover:text-red-900 font-bold text-lg leading-none px-2"
      >
        ×
      </button>
    </div>
  );
}
