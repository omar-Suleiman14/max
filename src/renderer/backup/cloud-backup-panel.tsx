import { AlertTriangle, CheckCircle2, CloudUpload, Download, RefreshCw, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { CloudBackupMetadata, CloudBackupStatus } from '../../shared/backup-contract';
import type { Locale } from '../app/i18n';
import { useAuth } from '../auth/auth-context';
import { AuthWidget } from '../auth/auth-provider';
import { readCloudBackupEnabled, writeCloudBackupEnabled } from '../auth/cloud-backup-preference';
import { Button } from '../ui/button';
import { cloudBackupCopy } from './cloud-backup-i18n';

type CloudBackupPanelProps = Readonly<{
  locale: Locale;
}>;

type Notice = Readonly<{ message: string; type: 'error' | 'success' }>;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * The reachable surface for Max Cloud Backup.
 *
 * Until this existed, `window.maxApi.cloudBackups` was never called by anything
 * but a test: the whole main-process service, the IPC channels and the deployed
 * Worker were unreachable from the product. Everything here is behind an
 * explicit opt-in, and with the opt-in off Max makes no cloud request at all.
 */
export function CloudBackupPanel({ locale }: CloudBackupPanelProps) {
  const { getToken, isSignedIn } = useAuth();
  const [enabled, setEnabled] = useState(() => readCloudBackupEnabled(window.localStorage));
  const [status, setStatus] = useState<CloudBackupStatus>();
  const [backups, setBackups] = useState<readonly CloudBackupMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  useEffect(() => {
    // A build with no Max Cloud address, or a host that refuses the channel
    // outright, must read as "unavailable" rather than leave the panel blank
    // under a ticked box.
    void window.maxApi.cloudBackups
      .getStatus()
      .then(setStatus, () => setStatus({ configured: false }));
  }, []);

  /**
   * Every cloud call needs a fresh token, because Clerk tokens are short-lived.
   * A cloud failure of any kind, including the channel itself refusing, becomes
   * a notice rather than an unhandled rejection: cloud backup is optional and
   * must never break the settings screen it lives on.
   */
  const withToken = useCallback(async <T,>(run: (token: string) => Promise<T>): Promise<T | undefined> => {
    try {
      const token = await getToken();
      if (!token) {
        setNotice({ message: cloudBackupCopy(locale, 'cloudSignInPrompt'), type: 'error' });
        return undefined;
      }
      return await run(token);
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : String(error), type: 'error' });
      return undefined;
    }
  }, [getToken, locale]);

  const loadBackups = useCallback(async () => {
    if (!enabled || !isSignedIn) return;
    setLoading(true);
    try {
      await withToken(async (token) => {
        const result = await window.maxApi.cloudBackups.list(token);
        if (result.ok) setBackups(result.value);
        else setNotice({ message: result.error.message, type: 'error' });
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, isSignedIn, withToken]);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  function handleToggle(next: boolean) {
    writeCloudBackupEnabled(next);
    setEnabled(next);
    setNotice(undefined);
    if (!next) setBackups([]);
  }

  async function handleCreate() {
    setCreating(true);
    setNotice(undefined);
    try {
      await withToken(async (token) => {
        const result = await window.maxApi.cloudBackups.create(token, 'manual');
        if (!result.ok) { setNotice({ message: result.error.message, type: 'error' }); return; }
        if (result.value.cloudError) {
          // The local backup succeeded. Say so, so nobody thinks the failure
          // means they have no backup at all.
          setNotice({ message: `${result.value.cloudError} ${cloudBackupCopy(locale, 'localKeptOnFailure')}`, type: 'error' });
          return;
        }
        setNotice({ message: cloudBackupCopy(locale, 'cloudCreated'), type: 'success' });
        setStatus(await window.maxApi.cloudBackups.getStatus());
        await loadBackups();
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleDownload(backup: CloudBackupMetadata) {
    setBusyId(backup.id);
    setNotice(undefined);
    try {
      await withToken(async (token) => {
        const result = await window.maxApi.cloudBackups.download(token, backup.id);
        setNotice(result.ok
          ? { message: cloudBackupCopy(locale, 'cloudDownloaded'), type: 'success' }
          : { message: result.error.message, type: 'error' });
        if (result.ok) window.dispatchEvent(new Event('max:backups-changed'));
      });
    } finally {
      setBusyId(undefined);
    }
  }

  async function handleRestore(backup: CloudBackupMetadata) {
    setBusyId(backup.id);
    setNotice(undefined);
    try {
      await withToken(async (token) => {
        const result = await window.maxApi.cloudBackups.restore(token, backup.id);
        if (!result.ok) { setNotice({ message: result.error.message, type: 'error' }); return; }
        setNotice(result.value.restored
          ? { message: cloudBackupCopy(locale, 'cloudRestored'), type: 'success' }
          : { message: result.value.error ?? cloudBackupCopy(locale, 'cloudRestoring'), type: 'error' });
        window.dispatchEvent(new Event('max:backups-changed'));
      });
    } finally {
      setBusyId(undefined);
    }
  }

  const lastBackupAt = status?.lastSuccessfulCloudBackupAt;

  return (
    <div className="cloud-backup-panel">
      <div className="apple-settings-row">
        <div className="apple-settings-row-left">
          <div className="apple-settings-content">
            <span className="apple-settings-title">{cloudBackupCopy(locale, 'cloudBackupTitle')}</span>
            <span className="apple-settings-description">{cloudBackupCopy(locale, 'cloudBackupDescription')}</span>
          </div>
        </div>
        <div className="apple-settings-row-right">
          <label className="cloud-backup-toggle">
            <input
              checked={enabled}
              onChange={(event) => handleToggle(event.target.checked)}
              type="checkbox"
            />
            <span>{cloudBackupCopy(locale, 'cloudEnable')}</span>
          </label>
        </div>
      </div>

      {enabled && !status?.configured && (
        <p className="cloud-backup-note" role="status">
          {status ? cloudBackupCopy(locale, 'cloudNotConfigured') : cloudBackupCopy(locale, 'cloudLoading')}
        </p>
      )}

      {enabled && status?.configured && (
        <>
          <AuthWidget locale={locale} />

          {!isSignedIn && <p className="cloud-backup-note">{cloudBackupCopy(locale, 'cloudSignInPrompt')}</p>}

          {isSignedIn && (
            <>
              <div className="cloud-backup-actions">
                <Button
                  disabled={creating}
                  icon={<CloudUpload aria-hidden="true" size={16} />}
                  onClick={() => void handleCreate()}
                  variant="secondary"
                >
                  {cloudBackupCopy(locale, creating ? 'cloudCreating' : 'cloudCreate')}
                </Button>
                <Button
                  disabled={loading}
                  icon={<RefreshCw aria-hidden="true" size={16} />}
                  onClick={() => void loadBackups()}
                >
                  {cloudBackupCopy(locale, 'cloudRefresh')}
                </Button>
              </div>

              <p className="cloud-backup-note">
                {cloudBackupCopy(locale, 'lastCloudBackup')}:{' '}
                {lastBackupAt
                  ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastBackupAt))
                  : cloudBackupCopy(locale, 'never')}
              </p>

              <details className="backup-history-disclosure" open>
                <summary>{cloudBackupCopy(locale, 'cloudSnapshots')} <span>{backups.length}</span></summary>
                {loading && <p role="status">{cloudBackupCopy(locale, 'cloudLoading')}</p>}
                {!loading && backups.length === 0 && <p>{cloudBackupCopy(locale, 'cloudEmpty')}</p>}
                {backups.map((backup) => (
                  <div className="cloud-backup-row" key={backup.id}>
                    <div>
                      <strong>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.createdAt))}</strong>
                      <small>{formatBytes(backup.sizeBytes)}</small>
                    </div>
                    <div className="cloud-backup-row__actions">
                      <Button
                        disabled={busyId === backup.id}
                        icon={<Download aria-hidden="true" size={14} />}
                        onClick={() => void handleDownload(backup)}
                      >
                        {cloudBackupCopy(locale, busyId === backup.id ? 'cloudDownloading' : 'cloudDownload')}
                      </Button>
                      <Button
                        disabled={busyId === backup.id}
                        icon={<RotateCcw aria-hidden="true" size={14} />}
                        onClick={() => void handleRestore(backup)}
                      >
                        {cloudBackupCopy(locale, busyId === backup.id ? 'cloudRestoring' : 'cloudRestore')}
                      </Button>
                    </div>
                  </div>
                ))}
              </details>
            </>
          )}
        </>
      )}

      {notice && (
        <div
          className={`badge ${notice.type === 'success' ? 'badge--success' : 'badge--danger'}`}
          role={notice.type === 'error' ? 'alert' : 'status'}
          style={{ padding: '10px 14px', fontSize: '13px', width: '100%' }}
        >
          {notice.type === 'success' ? <CheckCircle2 aria-hidden="true" size={16} /> : <AlertTriangle aria-hidden="true" size={16} />}
          <span>{notice.message}</span>
        </div>
      )}
    </div>
  );
}
