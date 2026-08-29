import type { DatabaseSync } from 'node:sqlite';

import type { BackupSchedule, CompleteOnboardingDraft, ShopMetadata } from '../../shared/blueprint-contract';
import { ObjectDomainError } from './object-repository';

export class ShopMetadataRepository {
  constructor(private readonly database: DatabaseSync) {}

  getMetadata(): ShopMetadata {
    const rows = this.database
      .prepare('SELECT key, value FROM app_metadata WHERE key LIKE ?')
      .all('shop.%') as { key: string; value: string }[];

    const map = new Map(rows.map((row) => [row.key, row.value]));

    const rawSchedule = map.get('shop.backup_schedule');
    const backupSchedule: BackupSchedule =
      rawSchedule === 'weekly' || rawSchedule === 'manual' ? rawSchedule : 'daily';

    const rawLocale = map.get('shop.locale');
    const locale: 'ar' | 'en' = rawLocale === 'ar' ? 'ar' : 'en';

    return {
      backupSchedule,
      blueprintName: map.get('shop.blueprint_name'),
      locale,
      onboardingCompleted: map.get('shop.onboarding_completed') === 'true',
      shopName: map.get('shop.name') ?? '',
    };
  }

  setKey(key: string, value: string): void {
    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO app_metadata (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(key, value, now);
  }

  updateMetadata(patch: Partial<ShopMetadata>): ShopMetadata {
    if (patch.shopName !== undefined) {
      const trimmed = patch.shopName.trim();
      if (trimmed.length < 1 || trimmed.length > 120) {
        throw new ObjectDomainError('invalid-input', 'Shop name must contain 1–120 characters.');
      }
      this.setKey('shop.name', trimmed);
    }
    if (patch.locale !== undefined) {
      if (patch.locale !== 'ar' && patch.locale !== 'en') {
        throw new ObjectDomainError('invalid-input', 'Locale must be ar or en.');
      }
      this.setKey('shop.locale', patch.locale);
    }
    if (patch.backupSchedule !== undefined) {
      if (!['daily', 'weekly', 'manual'].includes(patch.backupSchedule)) {
        throw new ObjectDomainError('invalid-input', 'Invalid backup schedule.');
      }
      this.setKey('shop.backup_schedule', patch.backupSchedule);
    }
    if (patch.onboardingCompleted !== undefined) {
      this.setKey('shop.onboarding_completed', patch.onboardingCompleted ? 'true' : 'false');
    }
    if (patch.blueprintName !== undefined) {
      this.setKey('shop.blueprint_name', patch.blueprintName);
    }
    return this.getMetadata();
  }

  completeOnboarding(draft: CompleteOnboardingDraft): ShopMetadata {
    const trimmed = draft.shopName.trim();
    if (trimmed.length < 1 || trimmed.length > 120) {
      throw new ObjectDomainError('invalid-input', 'Shop name must contain 1–120 characters.');
    }
    if (draft.locale !== 'ar' && draft.locale !== 'en') {
      throw new ObjectDomainError('invalid-input', 'Locale must be ar or en.');
    }
    if (!['daily', 'weekly', 'manual'].includes(draft.backupSchedule)) {
      throw new ObjectDomainError('invalid-input', 'Invalid backup schedule.');
    }

    this.updateMetadata({
      backupSchedule: draft.backupSchedule,
      blueprintName: draft.blueprint?.name,
      locale: draft.locale,
      onboardingCompleted: true,
      shopName: trimmed,
    });

    return this.getMetadata();
  }
}
