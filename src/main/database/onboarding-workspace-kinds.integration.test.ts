import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { WorkspaceTemplateV2 } from '../../shared/template-v2-contract';
import { phoneShopBlueprint } from '../../shared/starter-blueprints';
import { DatabaseService } from './database-service';

/**
 * The end of onboarding, for each kind of workspace somebody might be setting
 * up.
 *
 * Onboarding itself offers two routes, empty or a blueprint file, and the
 * component test covers the walk through the screens. What this covers is what
 * those two routes actually build, because "onboarding completed" and "the
 * person has a workspace they can use" are not the same claim.
 */

function service(): DatabaseService {
  const database = new DatabaseService(':memory:');
  database.initialize();
  return database;
}

const genericBlueprint = JSON.parse(
  readFileSync(join(process.cwd(), 'docs/examples/generic-workspace.max-blueprint.json'), 'utf-8'),
) as WorkspaceTemplateV2;

describe('finishing onboarding without a blueprint', () => {
  it.each(['en', 'ar'] as const)('leaves an empty, usable workspace in %s', (locale) => {
    const database = service();

    const metadata = database.completeOnboarding({
      backupSchedule: 'daily',
      locale,
      shopName: locale === 'ar' ? 'دفتر ملاحظات' : 'Reading notes',
    });

    expect(metadata.onboardingCompleted).toBe(true);
    expect(metadata.shopName).toBe(locale === 'ar' ? 'دفتر ملاحظات' : 'Reading notes');
    // Empty means empty. A notes workspace, a knowledge base and a project
    // tracker all arrive here, and none of them should find somebody else's
    // databases already in it.
    expect(database.databases.listDatabases()).toHaveLength(0);
    // Usable means the person can make the first thing themselves.
    const page = database.workspace.createNode({ kind: 'page', title: 'First note' });
    expect(database.workspace.getNode(page.id)?.title).toBe('First note');
    database.close();
  });

  it('records the workspace as blank rather than guessing at a template', () => {
    const database = service();

    database.completeOnboarding({ backupSchedule: 'manual', locale: 'en', shopName: 'Knowledge base' });

    expect(database.shopMetadata.getMetadata().blueprintName).toBeFalsy();
    database.close();
  });
});

describe('finishing onboarding with a blueprint the person brought', () => {
  it('builds the generic example workspace that ships in the repository', () => {
    const database = service();

    // This file is offered as the example of a blueprint that assumes nothing
    // about retail. Nothing tested that it still imports.
    const metadata = database.completeOnboarding({
      backupSchedule: 'daily',
      blueprint: genericBlueprint,
      locale: 'en',
      shopName: 'Field work',
      templateId: 'custom',
    });

    expect(metadata.onboardingCompleted).toBe(true);
    const databases = database.databases.listDatabases();
    expect(databases.length).toBeGreaterThan(0);
    // The workspace has to be queryable, not merely present.
    for (const built of databases) {
      expect(() => database.databaseQuery.query({ databaseId: built.id })).not.toThrow();
    }
  });

  it('still builds a working shop from the phone-shop blueprint, with its own language intact', () => {
    const database = service();

    database.completeOnboarding({
      backupSchedule: 'daily',
      blueprint: phoneShopBlueprint,
      locale: 'en',
      shopName: 'Al-Amal Telecom',
      templateId: 'custom',
    });

    // A shop is a legitimate workspace to build with Max, so the retail words
    // belong here and must survive the generic wording work.
    expect(database.shopMetadata.getMetadata().blueprintName).toBe('Mobile & Electronics Shop');
    expect(database.objects.listProperties('item').map(({ name }) => name)).toContain('IMEI');
    expect(database.templates.listTemplates('person').map(({ name }) => name)).toEqual(['Customer', 'Supplier']);
    database.close();
  });

  it('refuses a blueprint it cannot read and leaves the workspace alone', () => {
    const database = service();

    expect(() => database.completeOnboarding({
      backupSchedule: 'daily',
      blueprint: { name: 'Broken', version: 2 } as unknown as WorkspaceTemplateV2,
      locale: 'en',
      shopName: 'Whatever',
      templateId: 'custom',
    })).toThrow();

    // A failed import must not leave half a workspace behind, or a person
    // would have to start over with no way to tell what did land.
    expect(database.databases.listDatabases()).toHaveLength(0);
    expect(database.shopMetadata.getMetadata().onboardingCompleted).toBe(false);
    database.close();
  });
});
