/* In-app confirmation dialogs. `confirmAction()` asks the question in the
   app's own sheet (rendered by <ConfirmHost/>) and resolves true/false —
   replacing window.confirm(), which Telegram WebViews render inconsistently
   and which cannot be styled or localized. */

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
}

interface Pending extends ConfirmRequest { resolve: (ok: boolean) => void }

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Ask the user; resolves true when they confirm. */
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    current?.resolve(false); // a newer question replaces an unanswered one
    current = { ...request, resolve };
    emit();
  });
}

export const confirmStore = {
  get: (): Pending | null => current,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  settle(ok: boolean) {
    const pending = current;
    current = null;
    emit();
    pending?.resolve(ok);
  },
};
