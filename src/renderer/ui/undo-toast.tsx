import { CheckCircle2, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { TransactionRecord } from '../../shared/transaction-contract';
import type { Locale } from '../app/i18n';
import { quickEntryCopy } from '../quick-entry/quick-entry-i18n';

type UndoToastProps = Readonly<{
  durationMs?: number;
  locale: Locale;
  onDismiss: () => void;
  onUndo: (id: string) => Promise<void>;
  transaction: TransactionRecord;
}>;

export function UndoToast({
  durationMs = 6000,
  locale,
  onDismiss,
  onUndo,
  transaction,
}: UndoToastProps) {
  const [progress, setProgress] = useState(100);
  const [undone, setUndone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const deadline = useRef(Date.now() + durationMs);
  const busy = useRef(false);

  useEffect(() => {
    if (pending || error) return;
    if (undone) { const timer = setTimeout(() => dismiss.current(), 1200); return () => clearTimeout(timer); }
    const interval = setInterval(() => {
      const remaining = Math.max(0, ((deadline.current - Date.now()) / durationMs) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        dismiss.current();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [durationMs, pending, undone, error]);

  async function handleUndo() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onUndo(transaction.id);
      setUndone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally { busy.current = false; setPending(false); }
  }

  return (
    <div aria-live="polite" className="undo-toast" role="status">
      <div className="undo-toast__body">
        <CheckCircle2 aria-hidden="true" className="undo-toast__icon" size={18} />
        <div className="undo-toast__content">
          <strong>{undone ? quickEntryCopy(locale, 'transactionUndone') : quickEntryCopy(locale, 'undoSuccess')}</strong>
          <span className="undo-toast__meta">
            {transaction.note || `#${transaction.id.slice(0, 6)}`} · {transaction.totalAmount.toFixed(2)}
          </span>
        </div>

        {!undone && (
          <button disabled={pending} className="button button--secondary undo-toast__btn" onClick={() => void handleUndo()} type="button">
            <RotateCcw aria-hidden="true" size={14} />
            {quickEntryCopy(locale, 'undo')}
          </button>
        )}

        <button aria-label={quickEntryCopy(locale, 'cancel')} className="icon-button" onClick={onDismiss} type="button">
          <X aria-hidden="true" size={15} />
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="undo-toast__progress-track">
        <div className="undo-toast__progress-bar" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
