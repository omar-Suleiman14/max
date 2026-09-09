import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { BackupMetadata, BackupVerificationResult } from '../../shared/backup-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { backupCopy } from './backup-i18n';

type BackupManagerProps = Readonly<{
  locale: Locale;
}>;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupManager({ locale }: BackupManagerProps) {
  const [backups, setBackups] = useState<readonly BackupMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string>();
  const [verificationResults, setVerificationResults] = useState<Record<string, BackupVerificationResult>>({});
  const [restoreConfirmBackup, setRestoreConfirmBackup] = useState<BackupMetadata>();
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<{ message: string; type: 'error' | 'success' }>();
  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.maxApi.backups.list();
      setBackups(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  async function handleCreateBackup() {
    setCreating(true); setNotice(undefined);
    try {
      const result = await window.maxApi.backups.create('manual');
      if (!result.ok) throw new Error(result.error.message);
      setNotice({ message: backupCopy(locale, 'backupCreated'), type: 'success' });
      await loadBackups();
    } catch (error) { setNotice({ message: String(error), type: 'error' }); }
    finally { setCreating(false); }
  }

  async function handleVerify(backup: BackupMetadata) {
    setVerifyingId(backup.id);
    try {
      const result = await window.maxApi.backups.verify(backup.filePath);
      setVerificationResults((prev) => ({ ...prev, [backup.id]: result }));
    } catch {
      // ignore
    } finally {
      setVerifyingId(undefined);
    }
  }

  async function handleRestore(backup: BackupMetadata) {
    setRestoring(true);
    setNotice(undefined);
    try {
      const res = await window.maxApi.backups.restore(backup.filePath);
      if (res.ok && res.value.restored) {
        setNotice({ message: backupCopy(locale, 'restoreSuccess'), type: 'success' });
        setRestoreConfirmBackup(undefined);
        await loadBackups();
      } else {
        setNotice({
          message: res.ok ? (res.value.error ?? backupCopy(locale, 'restoreFailed')) : res.error.message,
          type: 'error',
        });
      }
    } catch (err) {
      setNotice({ message: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="backup-manager">
      <div className="apple-settings-row backup-manager__header">
        <div className="apple-settings-row-left"><div className="apple-settings-content">
          <span className="apple-settings-title">{backupCopy(locale, 'localBackupTitle')}</span>
          <span className="apple-settings-description">{backupCopy(locale, 'safetyGuarantee')}</span>
        </div>
        </div>
        <div className="apple-settings-row-right">
        <Button
          disabled={creating}
          icon={<HardDrive aria-hidden="true" size={16} />}
          onClick={() => void handleCreateBackup()}
          variant="secondary"
        >
          {creating ? backupCopy(locale, 'creating') : backupCopy(locale, 'createBackup')}
        </Button>
        </div>
      </div>

      {notice && (
        <div
          className={`badge ${notice.type === 'success' ? 'badge--success' : 'badge--danger'}`}
          style={{ padding: '10px 14px', fontSize: '13px', width: '100%' }}
        >
          {notice.type === 'success' ? <CheckCircle2 aria-hidden="true" size={16} /> : <AlertTriangle aria-hidden="true" size={16} />}
          <span>{notice.message}</span>
        </div>
      )}

      <details className="backup-history-disclosure">
        <summary>{backupCopy(locale, 'backupHistory')} <span>{backups.length}</span></summary>
        {loading && <p role="status">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading backups…'}</p>}
        {!loading && backups.length === 0 && <div className="backup-empty"><Archive size={22} /><p>{backupCopy(locale, 'emptyBackups')}</p></div>}
        {backups.map((backup) => <details className="backup-snapshot" key={backup.id}>
          <summary><span>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.createdAt))}</span><small>{formatBytes(backup.sizeBytes)}</small></summary>
          <div className="backup-snapshot-body"><small>{backup.filename}</small><div className="backup-snapshot-actions">
            <Button disabled={verifyingId === backup.id} icon={<ShieldCheck size={14} />} onClick={() => void handleVerify(backup)}>{backupCopy(locale, verifyingId === backup.id ? 'verifying' : 'verify')}</Button>
            <Button icon={<RotateCcw size={14} />} onClick={() => setRestoreConfirmBackup(backup)}>{backupCopy(locale, 'restore')}</Button>
          </div>{verificationResults[backup.id] && <p role="status">{backupCopy(locale, verificationResults[backup.id]!.valid ? 'integrityOk' : 'corrupted')}</p>}</div>
        </details>)}
      </details>

      {restoreConfirmBackup && (
        <FocusedOverlay className="object-dialog" labelId="restore-confirm-title" onClose={() => setRestoreConfirmBackup(undefined)}>
          <header className="dialog-header">
            <div>
              <p className="eyebrow">MAX · {backupCopy(locale, 'localBackupTitle')}</p>
              <h2 id="restore-confirm-title">{backupCopy(locale, 'restore')}</h2>
            </div>
            <button aria-label={backupCopy(locale, 'cancel')} className="icon-button" onClick={() => setRestoreConfirmBackup(undefined)} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </header>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="badge badge--info" style={{ padding: '12px 14px', fontSize: '13px', lineHeight: '1.4' }}>
              <AlertTriangle aria-hidden="true" size={18} style={{ flexShrink: 0 }} />
              <span>{backupCopy(locale, 'confirmRestore')}</span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-soft)' }}>
              {backupCopy(locale, 'targetSnapshot')}: <strong>{restoreConfirmBackup.filename}</strong> (
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(restoreConfirmBackup.createdAt))})
            </p>

            <footer className="form-footer">
              <Button onClick={() => setRestoreConfirmBackup(undefined)}>{backupCopy(locale, 'cancel')}</Button>
              <Button
                disabled={restoring}
                icon={<RotateCcw aria-hidden="true" size={16} />}
                onClick={() => void handleRestore(restoreConfirmBackup)}
                variant="primary"
              >
                {restoring ? backupCopy(locale, 'restoring') : backupCopy(locale, 'restore')}
              </Button>
            </footer>
          </div>
        </FocusedOverlay>
      )}

    </div>
  );
}
