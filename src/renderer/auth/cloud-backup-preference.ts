export const CLOUD_BACKUP_ENABLED_KEY = 'max.cloud-backup.enabled';
export const CLOUD_BACKUP_PREFERENCE_EVENT = 'max:cloud-backup-preference-changed';

export function readCloudBackupEnabled(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(CLOUD_BACKUP_ENABLED_KEY) === 'true';
}

export function writeCloudBackupEnabled(enabled: boolean): void {
  window.localStorage.setItem(CLOUD_BACKUP_ENABLED_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent<boolean>(CLOUD_BACKUP_PREFERENCE_EVENT, { detail: enabled }));
}
