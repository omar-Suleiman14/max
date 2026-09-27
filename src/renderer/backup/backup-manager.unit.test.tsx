// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupMetadata } from '../../shared/backup-contract';
import { BackupManager } from './backup-manager';

vi.mock('./cloud-backup-panel', () => ({ CloudBackupPanel: () => null }));
afterEach(() => cleanup());

const backup: BackupMetadata = {
  id: 'backup-1', filePath: 'C:\\Backups\\workspace.maxbak', filename: 'workspace.maxbak',
  checksum: 'abc', createdAt: '2026-09-26T10:00:00.000Z', schemaVersion: 19,
  sizeBytes: 2048, trigger: 'daily',
};

function setup(locale: 'en' | 'ar' = 'en') {
  const list = vi.fn().mockResolvedValue([backup]);
  const verify = vi.fn().mockResolvedValue({ valid: false, checksumMatch: true, sqliteIntegrityPassed: false, error: 'Integrity check failed' });
  const restore = vi.fn().mockResolvedValue({ ok: true, value: { restored: true, safetyRollbackOccurred: false, preRestoreBackupId: 'safety-1' } });
  const status = vi.fn().mockResolvedValue({ currentSchemaVersion: 19 });
  Object.defineProperty(window, 'maxApi', { configurable: true, value: {
    backups: { list, verify, restore, create: vi.fn(), status },
    shop: { getMetadata: vi.fn().mockResolvedValue({ backupSchedule: 'daily' }) },
  } });
  render(<main><BackupManager locale={locale} /></main>);
  return { list, verify, restore, status };
}

describe('local backup details', () => {
  it('shows the latest backup, schedule, location, trigger and split verification results', async () => {
    const { verify } = setup();
    expect(await screen.findByText(/Last successful local backup:/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('do not include images or attachments');
    expect(screen.getByText(/Next scheduled backup:/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Backup Snapshots'));
    fireEvent.click(screen.getAllByText(/Daily/).at(-1)!);
    expect(screen.getByText(/Format v1/)).toBeInTheDocument();
    expect(screen.getByText(/C:\\Backups\\workspace.maxbak/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verify Integrity' }));
    expect(verify).toHaveBeenCalledWith(backup.id);
    expect(await screen.findByText('Checksum: Passed')).toBeInTheDocument();
    expect(screen.getByText('SQLite integrity: Failed')).toBeInTheDocument();
  });

  it('explains the protective backup before restoring and shows its location afterwards', async () => {
    const { list } = setup();
    list.mockResolvedValue([backup, { ...backup, id: 'safety-1', filePath: 'C:\\Backups\\safety.maxbak', trigger: 'pre-restore' }]);
    await screen.findByText(/Last successful local backup:/);
    fireEvent.click(screen.getByText('Backup Snapshots'));
    fireEvent.click(screen.getAllByText(/Daily/).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByText(/A safety snapshot of your current data/)).toBeInTheDocument();
    expect(screen.getByText('Max will restart to open the restored workspace.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' }).at(-1)!);
    expect(await screen.findByText(/Protective backup saved at: C:\\Backups\\safety.maxbak/)).toBeInTheDocument();
  });

  it('renders the backup information in Arabic', async () => {
    setup('ar');
    expect(screen.getByRole('note')).toHaveTextContent('الصور أو المرفقات');
    expect(await screen.findByText(/آخر نسخة احتياطية محلية/)).toBeInTheDocument();
    expect(screen.getByText(/النسخة المجدولة القادمة/)).toBeInTheDocument();
  });

  it('surfaces a failed scheduled backup and warns before a newer-schema restore', async () => {
    const { status, list } = setup();
    status.mockResolvedValue({ currentSchemaVersion: 19, lastScheduledFailureAt: '2026-09-27T10:00:00.000Z' });
    list.mockResolvedValue([{ ...backup, schemaVersion: 999 }]);
    window.dispatchEvent(new Event('max:backups-changed'));
    expect(await screen.findByText(/Scheduled backup failed/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Backup Snapshots'));
    fireEvent.click(screen.getAllByText(/Daily/).at(-1)!);
    expect(screen.getByText(/newer Max version/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
  });

  it('keeps the protective backup location visible after a restart', async () => {
    const { status } = setup();
    status.mockResolvedValue({ currentSchemaVersion: 19, lastRestoreSafetyPath: 'C:\\Backups\\safety.maxbak' });
    window.dispatchEvent(new Event('max:backups-changed'));
    expect(await screen.findByText(/Protective backup saved at:/)).toBeInTheDocument();
    expect(screen.getByText(/C:\\Backups\\safety.maxbak/)).toBeInTheDocument();
  });

  it('labels and blocks a backup with a future format version', async () => {
    const { list } = setup();
    list.mockResolvedValue([{ ...backup, formatVersion: 999 }]);
    window.dispatchEvent(new Event('max:backups-changed'));
    await screen.findByText(/Last successful local backup:/);
    fireEvent.click(screen.getByText('Backup Snapshots'));
    fireEvent.click(screen.getAllByText(/Daily/).at(-1)!);
    expect(screen.getByText(/Format v999/)).toBeInTheDocument();
    expect(screen.getByText(/backup format is not supported/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
  });

  it('has no accessibility violations in the backup summary', async () => {
    setup();
    await screen.findByText(/Last successful local backup:/);
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
