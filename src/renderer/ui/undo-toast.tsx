import { CheckCircle2, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [durationMs, onDismiss]);

  async function handleUndo() {
    setUndone(true);
    await onUndo(transaction.id);
    setTimeout(onDismiss, 1200);
  }

  return (
    <div aria-live="polite" className="undo-toast" role="status">
      <div className="undo-toast__body">
        <CheckCircle2 aria-hidden="true" className="undo-toast__icon" size={18} />
        <div className="undo-toast__content">
          <strong>{undone ? quickEntryCopy(locale, 'transactionUndone') : quickEntryCopy(locale, 'undoSuccess')}</strong>
          <span className="undo-toast__meta">
            {transaction.note || `Sale #${transaction.id.slice(0, 6)}`} · {transaction.totalAmount.toFixed(2)}
          </span>
        </div>

        {!undone && (
          <button className="button button--secondary undo-toast__btn" onClick={() => void handleUndo()} type="button">
            <RotateCcw aria-hidden="true" size={14} />
            {quickEntryCopy(locale, 'undo')}
          </button>
        )}

        <button aria-label={quickEntryCopy(locale, 'cancel')} className="icon-button" onClick={onDismiss} type="button">
          <X aria-hidden="true" size={15} />
        </button>
      </div>

      <div className="undo-toast__progress-track">
        <div className="undo-toast__progress-bar" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
