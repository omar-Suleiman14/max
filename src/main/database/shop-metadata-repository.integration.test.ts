import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

function service(): DatabaseService {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('ShopMetadataRepository', () => {
  it('reads default metadata on fresh database', () => {
    const db = service();
    const metadata = db.shopMetadata.getMetadata();
    expect(metadata.shopName).toBe('');
    expect(metadata.locale).toBe('en');
    expect(metadata.onboardingCompleted).toBe(false);
    expect(metadata.backupSchedule).toBe('daily');
    db.close();
  });

  it('updates metadata fields with validation', () => {
    const db = service();
    db.shopMetadata.updateMetadata({
      backupSchedule: 'weekly',
      locale: 'ar',
      shopName: 'Al-Madina Phone Shop',
    });

    const updated = db.shopMetadata.getMetadata();
    expect(updated.shopName).toBe('Al-Madina Phone Shop');
    expect(updated.locale).toBe('ar');
    expect(updated.backupSchedule).toBe('weekly');

    expect(() => db.shopMetadata.updateMetadata({ shopName: '' })).toThrow('1–120');
    expect(() => db.shopMetadata.updateMetadata({ shopName: 'x'.repeat(121) })).toThrow('1–120');
    db.close();
  });

  it('completes onboarding and sets status to true', () => {
    const db = service();
    const completed = db.shopMetadata.completeOnboarding({
      backupSchedule: 'daily',
      locale: 'ar',
      shopName: 'My Brand New Shop',
    });

    expect(completed.onboardingCompleted).toBe(true);
    expect(completed.shopName).toBe('My Brand New Shop');
    expect(completed.locale).toBe('ar');

    const freshRead = db.shopMetadata.getMetadata();
    expect(freshRead.onboardingCompleted).toBe(true);
    db.close();
  });
});

it('persists the accepted terms version and timestamp with onboarding', () => {
  const db = new DatabaseService(':memory:'); db.initialize();
  const result=db.completeOnboarding({shopName:'Terms test',locale:'ar',backupSchedule:'manual',acceptedTermsVersion:'2026-09-06'});
  expect(result.acceptedTermsVersion).toBe('2026-09-06');
  expect(result.acceptedTermsAt).toMatch(/^\d{4}-/);
  expect(db.shopMetadata.getMetadata().acceptedTermsAt).toBe(result.acceptedTermsAt);
  db.close();
});
