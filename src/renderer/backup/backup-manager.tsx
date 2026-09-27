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

import { BACKUP_FORMAT_VERSION, type BackupMetadata, type BackupVerificationResult, type LocalBackupStatus } from '../../shared/backup-contract';
import type { BackupSchedule } from '../../shared/blueprint-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { backupCopy } from './backup-i18n';
import { CloudBackupPanel } from './cloud-backup-panel';

type BackupManagerProps = Readonly<{
  locale: Locale;
  schedule?: BackupSchedule;
}>;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupManager({ locale, schedule: configuredSchedule }: BackupManagerProps) {
  const [backups, setBackups] = useState<readonly BackupMetadata[]>([]);
  const [schedule, setSchedule] = useState<BackupSchedule>('manual');
  const [status, setStatus] = useState<LocalBackupStatus>();
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
    const loadStatus = () => { void window.maxApi.backups.status().then(setStatus).catch(() => undefined); };
    loadStatus();
    const statusTimer = window.setInterval(loadStatus, 60000);
    void window.maxApi.shop.getMetadata().then((metadata) => setSchedule(metadata.backupSchedule)).catch(() => undefined);
    // Downloading a cloud backup puts a new file in the local backup list, so
    // the list has to hear about it from outside this component.
    const refresh = () => { void loadBackups(); loadStatus(); };
    window.addEventListener('max:backups-changed', refresh);
    return () => { window.clearInterval(statusTimer); window.removeEventListener('max:backups-changed', refresh); };
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
      const result = await window.maxApi.backups.verify(backup.id);
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
      const res = await window.maxApi.backups.restore(backup.id);
      if (res.ok && res.value.restored) {
        let safety: BackupMetadata | undefined;
        try {
          const list = await window.maxApi.backups.list();
          setBackups(list);
          safety = list.find((entry) => entry.id === res.value.preRestoreBackupId);
        } catch { /* Restoration succeeded even if refreshing the list fails. */ }
        setNotice({ message: `${backupCopy(locale, 'restoreSuccess')} ${safety ? `${backupCopy(locale, 'protectiveBackup')}: ${safety.filePath}` : ''}`, type: 'success' });
        void window.maxApi.backups.status().then(setStatus).catch(() => undefined);
        setRestoreConfirmBackup(undefined);
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

  const activeSchedule = configuredSchedule ?? schedule;
  const latest = backups[0];
  const lastScheduled = backups.find((backup) => backup.trigger === 'daily' || backup.trigger === 'weekly');
  const nextScheduledAt = activeSchedule !== 'manual' && lastScheduled
    ? new Date(Date.parse(lastScheduled.createdAt) + (activeSchedule === 'weekly' ? 7 : 1) * 86400000)
    : undefined;
  const triggerLabel = (backup: BackupMetadata) => {
    const key = ({ daily: 'daily', weekly: 'weekly', manual: 'manual', 'pre-delete': 'preDelete', 'pre-migration': 'preMigration', 'pre-restore': 'preRestore' } as const)[backup.trigger];
    return backupCopy(locale, key);
  };
  const dateTime = (value: string | Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

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

      <p role="note">{backupCopy(locale, 'assetsNotIncluded')}</p>

      {notice && (
        <div
          className={`badge ${notice.type === 'success' ? 'badge--success' : 'badge--danger'}`}
          style={{ padding: '10px 14px', fontSize: '13px', width: '100%' }}
        >
          {notice.type === 'success' ? <CheckCircle2 aria-hidden="true" size={16} /> : <AlertTriangle aria-hidden="true" size={16} />}
          <span>{notice.message}</span>
        </div>
      )}

      <p role="status">{backupCopy(locale, 'latestBackup')}: {latest ? dateTime(latest.createdAt) : backupCopy(locale, 'noLatestBackup')}</p>
      {status?.lastScheduledFailureAt && <p role="alert" className="badge badge--danger">{backupCopy(locale, 'scheduledFailure')} {dateTime(status.lastScheduledFailureAt)}</p>}
      {status?.lastRestoreSafetyPath && <p role="status">{backupCopy(locale, 'protectiveBackup')}: <span dir="auto">{status.lastRestoreSafetyPath}</span></p>}
      <p>{backupCopy(locale, 'backupSchedule')}: {backupCopy(locale, activeSchedule)}{activeSchedule !== 'manual' && <> · {backupCopy(locale, 'nextBackup')}: {nextScheduledAt ? dateTime(nextScheduledAt) : backupCopy(locale, 'scheduledBackup')}</>}</p>

      <details className="backup-history-disclosure">
        <summary>{backupCopy(locale, 'backupHistory')} <span>{backups.length}</span></summary>
        {loading && <p role="status">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading backups…'}</p>}
        {!loading && backups.length === 0 && <div className="backup-empty"><Archive size={22} /><p>{backupCopy(locale, 'emptyBackups')}</p></div>}
        {backups.map((backup) => <details className="backup-snapshot" key={backup.id}>
          <summary><span>{dateTime(backup.createdAt)} · {triggerLabel(backup)} · {locale === 'ar' ? 'صيغة النسخة' : 'Format'} v{backup.formatVersion ?? 1}</span><small>{formatBytes(backup.sizeBytes)}</small></summary>
          <div className="backup-snapshot-body"><small>{backupCopy(locale, 'location')}: <span dir="auto">{backup.filePath}</span></small><div className="backup-snapshot-actions">
            <Button disabled={verifyingId === backup.id} icon={<ShieldCheck size={14} />} onClick={() => void handleVerify(backup)}>{backupCopy(locale, verifyingId === backup.id ? 'verifying' : 'verify')}</Button>
            <Button disabled={(backup.formatVersion ?? 1) !== BACKUP_FORMAT_VERSION || (status !== undefined && backup.schemaVersion > status.currentSchemaVersion)} icon={<RotateCcw size={14} />} onClick={() => setRestoreConfirmBackup(backup)}>{backupCopy(locale, 'restore')}</Button>
          </div>{(backup.formatVersion ?? 1) !== BACKUP_FORMAT_VERSION && <p role="alert">{locale === 'ar' ? 'صيغة النسخة الاحتياطية غير مدعومة في هذا الإصدار من ماكس.' : 'This backup format is not supported by this Max version.'}</p>}{status !== undefined && backup.schemaVersion > status.currentSchemaVersion && <p role="alert">{backupCopy(locale, 'newerSchema')}</p>}{verificationResults[backup.id] && <div role="status"><p>{backupCopy(locale, 'checksumResult')}: {backupCopy(locale, verificationResults[backup.id]!.checksumMatch ? 'passed' : 'failed')}</p><p>{backupCopy(locale, 'sqliteResult')}: {backupCopy(locale, verificationResults[backup.id]!.sqliteIntegrityPassed ? 'passed' : 'failed')}</p>{verificationResults[backup.id]!.error && <p>{verificationResults[backup.id]!.error}</p>}</div>}</div>
        </details>)}
      </details>

      <CloudBackupPanel locale={locale} />

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
            <p>{locale === 'ar' ? 'سيُعاد تشغيل ماكس لفتح مساحة العمل المستعادة.' : 'Max will restart to open the restored workspace.'}</p>

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
