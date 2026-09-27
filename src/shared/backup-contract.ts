export type BackupTrigger = 'daily' | 'manual' | 'pre-delete' | 'pre-migration' | 'pre-restore' | 'weekly';
export const BACKUP_FORMAT_VERSION = 1;

export type BackupMetadata = Readonly<{
  checksum: string;
  createdAt: string;
  filename: string;
  filePath: string;
  /** Missing on backups created before format versioning; those are format 1. */
  formatVersion?: number;
  id: string;
  schemaVersion: number;
  sizeBytes: number;
  trigger: BackupTrigger;
}>;

export type BackupVerificationResult = Readonly<{
  checksumMatch: boolean;
  error?: string;
  formatVersion?: number;
  schemaVersion?: number;
  sqliteIntegrityPassed: boolean;
  valid: boolean;
}>;

export type LocalBackupStatus = Readonly<{
  currentBackupFormatVersion: number;
  currentSchemaVersion: number;
  lastScheduledFailureAt?: string;
  lastRestoreSafetyPath?: string;
}>;

export type RestoreResult = Readonly<{
  error?: string;
  preRestoreBackupId?: string;
  restored: boolean;
  safetyRollbackOccurred: boolean;
}>;

export type CloudBackupMetadata = Readonly<{
  checksum: string;
  createdAt: string;
  id: string;
  sizeBytes: number;
  trigger: BackupTrigger;
}>;

export type CloudBackupCreateResult = Readonly<{
  cloudBackup?: CloudBackupMetadata;
  cloudError?: string;
  localBackup: BackupMetadata;
}>;

export type CloudBackupStatus = Readonly<{
  configured: boolean;
  lastSuccessfulCloudBackupAt?: string;
}>;

/**
 * The steps a cloud backup passes through, in order. A failure names the step
 * it stopped at so the next report says where it broke instead of only that it
 * broke.
 */
export type CloudBackupStep =
  | 'authenticate'
  | 'local-backup'
  | 'upload'
  | 'list'
  | 'download'
  | 'checksum'
  | 'import'
  | 'restore'
  | 'schedule';
