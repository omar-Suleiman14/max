export type BackupTrigger = 'daily' | 'manual' | 'pre-delete' | 'pre-migration' | 'pre-restore' | 'weekly';

export type BackupMetadata = Readonly<{
  checksum: string;
  createdAt: string;
  filename: string;
  filePath: string;
  id: string;
  schemaVersion: number;
  sizeBytes: number;
  trigger: BackupTrigger;
}>;

export type BackupVerificationResult = Readonly<{
  checksumMatch: boolean;
  error?: string;
  schemaVersion?: number;
  sqliteIntegrityPassed: boolean;
  valid: boolean;
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
