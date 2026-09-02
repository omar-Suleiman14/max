import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cloud,
  CloudDownload,
  HardDrive,
  History,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { BackupMetadata, BackupVerificationResult, CloudBackupMetadata, CloudBackupStatus } from '../../shared/backup-contract';
import type { Locale } from '../app/i18n';
import { useAuth } from '../auth/auth-context';
import { AuthWidget } from '../auth/auth-provider';
import { readCloudBackupEnabled, writeCloudBackupEnabled } from '../auth/cloud-backup-preference';
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
  const auth = useAuth();
  const [backups, setBackups] = useState<readonly BackupMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string>();
  const [verificationResults, setVerificationResults] = useState<Record<string, BackupVerificationResult>>({});
  const [restoreConfirmBackup, setRestoreConfirmBackup] = useState<BackupMetadata>();
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<{ message: string; type: 'error' | 'success' }>();
  const [cloudBackups, setCloudBackups] = useState<readonly CloudBackupMetadata[]>([]);
  const [cloudStatus, setCloudStatus] = useState<CloudBackupStatus>({ configured: false });
  const [cloudEnabled, setCloudEnabled] = useState(() => readCloudBackupEnabled(window.localStorage));
  const [restoreConfirmCloud, setRestoreConfirmCloud] = useState<CloudBackupMetadata>();

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

  const loadCloud = useCallback(async () => {
    const status = await window.maxApi.cloudBackups.getStatus();
    setCloudStatus(status);
    if (!cloudEnabled || !status.configured || !auth.isSignedIn) {
      setCloudBackups([]);
      return;
    }
    const token = await auth.getToken();
    if (!token) return;
    const result = await window.maxApi.cloudBackups.list(token);
    if (result.ok) setCloudBackups(result.value);
  }, [auth, cloudEnabled]);

  useEffect(() => {
    void loadCloud();
    if (!cloudEnabled || !auth.isSignedIn) return;
    void Promise.all([auth.getToken(), window.maxApi.shop.getMetadata()]).then(async ([token, metadata]) => {
      if (!token) return;
      const result = await window.maxApi.cloudBackups.runScheduled(token, metadata.backupSchedule);
      if (result.ok && result.value) {
        await loadBackups();
        await loadCloud();
      }
    }).catch(() => undefined);
  }, [auth, cloudEnabled, loadBackups, loadCloud]);

  async function handleCreateBackup() {
    setCreating(true);
    setNotice(undefined);
    try {
      const token = cloudEnabled && cloudStatus.configured && auth.isSignedIn ? await auth.getToken() : null;
      if (token) {
        const result = await window.maxApi.cloudBackups.create(token, 'manual');
        if (!result.ok) {
          setNotice({ message: result.error.message, type: 'error' });
        } else if (result.value.cloudError) {
          setNotice({ message: locale === 'ar' ? `حُفظت النسخة المحلية. تعذر الحفظ السحابي: ${result.value.cloudError}` : `Local backup saved. Cloud backup failed: ${result.value.cloudError}`, type: 'error' });
        } else {
          setNotice({ message: locale === 'ar' ? 'حُفظت النسختان المحلية والسحابية.' : 'Local and cloud backups saved.', type: 'success' });
        }
        await loadBackups();
        await loadCloud();
      } else {
        const res = await window.maxApi.backups.create('manual');
        setNotice(res.ok
          ? { message: backupCopy(locale, 'backupCreated'), type: 'success' }
          : { message: res.error.message, type: 'error' });
        if (res.ok) await loadBackups();
      }
    } catch (err) {
      setNotice({ message: err instanceof Error ? err.message : String(err), type: 'error' });
    } finally {
      setCreating(false);
    }
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

  async function handleCloudRestore(backup: CloudBackupMetadata) {
    setRestoring(true);
    setNotice(undefined);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error(locale === 'ar' ? 'سجّل الدخول لاستعادة نسخة سحابية.' : 'Sign in to restore a cloud backup.');
      const result = await window.maxApi.cloudBackups.restore(token, backup.id);
      if (result.ok && result.value.restored) {
        setNotice({ message: backupCopy(locale, 'restoreSuccess'), type: 'success' });
        setRestoreConfirmCloud(undefined);
        await loadBackups();
      } else {
        setNotice({ message: result.ok ? (result.value.error ?? backupCopy(locale, 'restoreFailed')) : result.error.message, type: 'error' });
      }
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : String(error), type: 'error' });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="backup-manager">
      <div className="backup-manager__header">
        <div>
          <h3>{backupCopy(locale, 'localBackupTitle')}</h3>
          <p className="step-subtitle">{backupCopy(locale, 'safetyGuarantee')}</p>
        </div>
        <Button
          disabled={creating}
          icon={<HardDrive aria-hidden="true" size={16} />}
          onClick={() => void handleCreateBackup()}
          variant="primary"
        >
          {creating ? backupCopy(locale, 'creating') : backupCopy(locale, 'createBackup')}
        </Button>
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

      <div className="backup-history">
        <div className="section-title">
          <History aria-hidden="true" size={16} />
          <h4>{backupCopy(locale, 'backupHistory')}</h4>
        </div>

        {backups.length === 0 ? (
          <div className="object-empty" aria-busy={loading}>
            <Archive aria-hidden="true" size={24} />
            <p>{backupCopy(locale, 'emptyBackups')}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{backupCopy(locale, 'time')}</th>
                  <th>{backupCopy(locale, 'trigger')}</th>
                  <th>{backupCopy(locale, 'size')}</th>
                  <th>{backupCopy(locale, 'checksum')}</th>
                  <th>{backupCopy(locale, 'actions')}</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => {
                  const vResult = verificationResults[b.id];
                  return (
                    <tr key={b.id}>
                      <td>
                        <strong>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(b.createdAt))}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '11px' }}>{b.filename}</small>
                      </td>
                      <td>
                        <span className={`badge ${b.trigger === 'pre-restore' ? 'badge--info' : 'badge--muted'}`}>
                          {b.trigger === 'pre-restore' ? backupCopy(locale, 'preRestore') : b.trigger}
                        </span>
                      </td>
                      <td>{formatBytes(b.sizeBytes)}</td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px' }} title={b.checksum}>
                          {b.checksum.slice(0, 10)}...
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <Button
                            disabled={verifyingId === b.id}
                            icon={<ShieldCheck aria-hidden="true" size={13} />}
                            onClick={() => void handleVerify(b)}
                          >
                            {verifyingId === b.id ? backupCopy(locale, 'verifying') : backupCopy(locale, 'verify')}
                          </Button>
                          <Button
                            icon={<RotateCcw aria-hidden="true" size={13} />}
                            onClick={() => setRestoreConfirmBackup(b)}
                          >
                            {backupCopy(locale, 'restore')}
                          </Button>
                          {vResult && (
                            <span className={`badge ${vResult.valid ? 'badge--success' : 'badge--danger'}`} style={{ fontSize: '11px' }}>
                              {vResult.valid ? backupCopy(locale, 'integrityOk') : backupCopy(locale, 'corrupted')}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="backup-history backup-history--cloud">
        <div className="cloud-backup-heading">
          <div className="section-title">
            <Cloud aria-hidden="true" size={16} />
            <div>
              <h4>{locale === 'ar' ? 'النسخ الاحتياطي السحابي' : 'Cloud backup'}</h4>
              <small>{locale === 'ar' ? 'اختياري. تظل قاعدة البيانات المحلية هي المصدر الأساسي.' : 'Optional. Your local database remains authoritative.'}</small>
            </div>
          </div>
          <button
            aria-checked={cloudEnabled}
            aria-label={locale === 'ar' ? 'تفعيل النسخ الاحتياطي السحابي' : 'Enable cloud backup'}
            className="settings-switch"
            data-checked={cloudEnabled}
            disabled={!cloudStatus.configured}
            onClick={() => {
              const next = !cloudEnabled;
              setCloudEnabled(next);
              writeCloudBackupEnabled(next);
            }}
            role="switch"
            type="button"
          >
            <span />
          </button>
        </div>
        {!cloudStatus.configured || !auth.isAvailable ? (
          <p className="settings-muted">{locale === 'ar' ? 'هذه النسخة غير مهيأة للنسخ السحابي. تظل النسخ المحلية متاحة بالكامل.' : 'This build is not configured for cloud backup. Local backup remains fully available.'}</p>
        ) : !cloudEnabled ? (
          <p className="settings-muted">{locale === 'ar' ? 'لن يطلب Max حسابًا ولن يتصل بخدمة السحابة حتى تفعّل هذا الخيار.' : 'Max will not ask for an account or contact the cloud until you turn this on.'}</p>
        ) : (
          <div className="cloud-backup-auth">
            <AuthWidget locale={locale} />
            <p className="settings-muted">
              {auth.isSignedIn
                ? (locale === 'ar' ? 'جاهز. النسخ السحابية مشفرة وخاصة بحسابك.' : 'Ready. Cloud backups are encrypted and private to your account.')
                : (locale === 'ar' ? 'سجّل الدخول لتوصيل هذه المساحة بالنسخ السحابي.' : 'Sign in to connect this workspace to cloud backup.')}
              {cloudStatus.lastSuccessfulCloudBackupAt && ` ${locale === 'ar' ? 'آخر نسخة:' : 'Last backup:'} ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(cloudStatus.lastSuccessfulCloudBackupAt))}`}
            </p>
          </div>
        )}
        {cloudEnabled && auth.isSignedIn && cloudBackups.length > 0 && (
          <div className="settings-trash-list">
            {cloudBackups.map((backup) => (
              <div key={backup.id}>
                <span>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.createdAt))} · {formatBytes(backup.sizeBytes)}</span>
                <Button icon={<CloudDownload aria-hidden="true" size={14} />} onClick={() => setRestoreConfirmCloud(backup)}>{backupCopy(locale, 'restore')}</Button>
              </div>
            ))}
          </div>
        )}
      </div>

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
      {restoreConfirmCloud && (
        <FocusedOverlay className="object-dialog" labelId="cloud-restore-confirm-title" onClose={() => setRestoreConfirmCloud(undefined)}>
          <header className="dialog-header"><div><p className="eyebrow">MAX · CLOUD</p><h2 id="cloud-restore-confirm-title">{backupCopy(locale, 'restore')}</h2></div><button aria-label={backupCopy(locale, 'cancel')} className="icon-button" onClick={() => setRestoreConfirmCloud(undefined)} type="button"><X aria-hidden="true" size={19} /></button></header>
          <div style={{ padding: '16px 20px', display: 'grid', gap: '14px' }}>
            <p>{backupCopy(locale, 'confirmRestore')}</p>
            <footer className="form-footer"><Button onClick={() => setRestoreConfirmCloud(undefined)}>{backupCopy(locale, 'cancel')}</Button><Button disabled={restoring} onClick={() => void handleCloudRestore(restoreConfirmCloud)} variant="primary">{restoring ? backupCopy(locale, 'restoring') : backupCopy(locale, 'restore')}</Button></footer>
          </div>
        </FocusedOverlay>
      )}
    </div>
  );
}
