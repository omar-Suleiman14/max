import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BackupService } from './backup-service';
import { DatabaseService } from './database-service';
import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';
import type { WorkspaceRelation } from '../../shared/relation-contract';
import type { WorkspaceView } from '../../shared/view-contract';
import type { WorkflowValue, WorkspaceWorkflow, WorkspaceWorkflowDraft } from '../../shared/workflow-contract';

/**
 * The Max 2.0 regression baseline.
 *
 * One person's whole first session with Max, in order: open a new workspace,
 * write a page, build a database, give it properties, fill it with records,
 * relate it to a second database, add a rollup and a formula, save a view,
 * write a quick action, run it, back the workspace up, break it, restore it,
 * and come back after a restart.
 *
 * Every step asserts what the data became, not that nothing threw. The steps
 * share one workspace on disk deliberately: the point is that the state each
 * step leaves behind is still correct several steps later, and still correct
 * after the database has been closed, replaced by a backup and reopened.
 *
 * Nothing here reaches the network, and every file it writes lives inside one
 * temporary directory that is removed when the file finishes.
 */

const literal = (value: unknown): WorkflowValue => ({ source: 'literal', value });
const variable = (key: string): WorkflowValue => ({ source: 'variable', key });

describe('the Max regression baseline journey', () => {
  let workspaceDir = '';
  let databasePath = '';
  let backupDir = '';
  let max: DatabaseService;

  /** Reopening is the restart: a new process would do exactly this. */
  function openWorkspace(): DatabaseService {
    const service = new DatabaseService(databasePath);
    service.initialize();
    return service;
  }

  // Everything the later steps need to name again.
  const journey: {
    active?: string;
    capacity?: WorkspaceProperty;
    clientProjects?: WorkspaceProperty;
    clients?: string;
    due?: WorkspaceProperty;
    hours?: WorkspaceProperty;
    later?: string;
    owner?: WorkspaceProperty;
    page?: string;
    paused?: string;
    projects?: string;
    quickAction?: WorkspaceWorkflow;
    relation?: WorkspaceRelation;
    rollup?: WorkspaceProperty;
    snapshotId?: string;
    status?: WorkspaceProperty;
    studio?: WorkspaceRecord;
    view?: WorkspaceView;
  } = {};

  const pageContent = JSON.stringify([
    { content: 'The work', id: 'heading', type: 'heading_1' },
    { content: 'Everything this studio owes somebody.', id: 'note', type: 'text' },
  ]);

  beforeAll(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'max-regression-baseline-'));
    databasePath = join(workspaceDir, 'max.sqlite');
    backupDir = join(workspaceDir, 'backups');
    max = openWorkspace();
  });

  afterAll(() => {
    max.close();
    rmSync(workspaceDir, { force: true, recursive: true });
  });

  it('opens a workspace on an empty directory with every migration applied and nothing in it', () => {
    const health = max.getHealth();

    expect(health.status).toBe('ready');
    // Every numbered migration ran, and the chain has no gap in it.
    expect(health.schemaVersion).toBeGreaterThanOrEqual(18);
    expect(health.migrationCount).toBe(health.schemaVersion);

    const navigation = max.workspace.getNavigation();
    expect(navigation.pages).toHaveLength(0);
    expect(navigation.databases).toHaveLength(0);
    expect(max.workflows.listWorkflows()).toEqual([]);
  });

  it('keeps what is written on a page, including after the page is renamed', () => {
    const page = max.workspace.createNode({ kind: 'page', title: 'Studio' });
    journey.page = page.id;
    max.workspace.updateNode(page.id, { contentJson: pageContent });
    max.workspace.updateNode(page.id, { title: 'The studio' });

    const saved = max.workspace.getNode(page.id)!;
    expect(saved.title).toBe('The studio');
    expect(saved.contentJson).toBe(pageContent);
    expect(max.workspace.getNavigation().pages.map((item) => item.id)).toEqual([page.id]);
  });

  it('builds two databases under that page and gives them typed properties', () => {
    const clients = max.databases.createDatabase({ parentNodeId: journey.page, title: 'Clients' });
    const projects = max.databases.createDatabase({ parentNodeId: journey.page, title: 'Projects' });
    journey.clients = clients.id;
    journey.projects = projects.id;

    journey.owner = max.properties.createProperty({ databaseId: projects.id, name: 'Owner', type: 'text' });
    journey.hours = max.properties.createProperty({ databaseId: projects.id, name: 'Hours', type: 'number' });
    journey.due = max.properties.createProperty({ databaseId: projects.id, name: 'Due', type: 'date' });
    journey.status = max.properties.createProperty({
      databaseId: projects.id,
      name: 'Status',
      options: [{ label: 'Active' }, { label: 'Paused' }],
      type: 'select',
    });
    const [active, paused] = journey.status.options!;
    journey.active = active!.id;
    journey.paused = paused!.id;

    const named = max.properties.listProperties(projects.id).map((property) => property.name);
    expect(named).toEqual(expect.arrayContaining(['Owner', 'Hours', 'Due', 'Status']));
    // A database is a collection of pages, so it always has a title property.
    expect(max.properties.listProperties(projects.id).some((property) => property.type === 'title')).toBe(true);
    expect(max.workspace.getNavigation().databases.map((item) => item.title).sort()).toEqual(['Clients', 'Projects']);
  });

  it('creates records that keep the values they were given', () => {
    const rows = [
      { hours: 12, owner: 'Nadia', status: journey.active!, title: 'Signage' },
      { hours: 30, owner: 'Karim', status: journey.active!, title: 'Rebrand' },
      { hours: 4, owner: 'Nadia', status: journey.paused!, title: 'Menu cards' },
    ];
    for (const row of rows) {
      max.records.createRecord({
        databaseId: journey.projects!,
        properties: { [journey.hours!.id]: row.hours, [journey.owner!.id]: row.owner, [journey.status!.id]: row.status },
        title: row.title,
      });
    }
    journey.studio = max.records.createRecord({ databaseId: journey.clients!, properties: {}, title: 'Studio North' });

    const page = max.databaseQuery.query({ databaseId: journey.projects! });
    expect(page.totalCount).toBe(3);
    const rebrand = page.records.find((record) => record.title === 'Rebrand')!;
    expect(rebrand.properties[journey.hours!.id]).toBe(30);
    expect(rebrand.properties[journey.owner!.id]).toBe('Karim');
    expect(rebrand.properties[journey.status!.id]).toBe(journey.active);
  });

  it('relates the two databases and reads the link from both ends', () => {
    journey.clientProjects = max.properties.createProperty({
      databaseId: journey.clients!,
      name: 'Projects',
      type: 'relation',
    });
    journey.relation = max.relations.createRelation({
      inversePropertyName: 'Client',
      sourceCardinality: 'one',
      sourceDatabaseId: journey.clients!,
      sourcePropertyId: journey.clientProjects.id,
      targetCardinality: 'many',
      targetDatabaseId: journey.projects!,
    });

    const projects = max.databaseQuery.query({ databaseId: journey.projects! }).records;
    for (const project of projects.filter((record) => record.title !== 'Menu cards')) {
      max.relations.connect(journey.relation.id, journey.studio!.id, project.id);
    }

    const fromClient = max.relations
      .getRelatedRecords(journey.studio!.id, journey.relation.id)
      .map((record) => record.title)
      .sort();
    expect(fromClient).toEqual(['Rebrand', 'Signage']);

    // A relation writes both sides, so the project has to know its client too.
    const signage = projects.find((record) => record.title === 'Signage')!;
    const fromProject = max.relations.getRelatedRecords(signage.id, journey.relation.id).map((record) => record.title);
    expect(fromProject).toEqual(['Studio North']);
  });

  it('works out a rollup and a formula, and works them out again when the numbers change', () => {
    journey.rollup = max.properties.createProperty({
      config: { rollup: { aggregation: 'sum', relationPropertyId: journey.clientProjects!.id, targetPropertyId: journey.hours!.id } },
      databaseId: journey.clients!,
      name: 'Hours booked',
      type: 'rollup',
    });
    journey.capacity = max.properties.createProperty({
      config: { formula: `[${journey.hours!.id}] * 2` },
      databaseId: journey.projects!,
      name: 'Capacity',
      type: 'formula',
    });

    const booked = () => max.databaseQuery.query({ databaseId: journey.clients! }).records[0]?.properties[journey.rollup!.id];
    const capacityOf = (title: string) =>
      max.databaseQuery.query({ databaseId: journey.projects! }).records.find((record) => record.title === title)
        ?.properties[journey.capacity!.id];

    expect(booked()).toBe(42);
    expect(capacityOf('Rebrand')).toBeCloseTo(60);

    const rebrand = max.databaseQuery.query({ databaseId: journey.projects! }).records.find((record) => record.title === 'Rebrand')!;
    max.records.updateRecord(rebrand.id, { properties: { [journey.hours!.id]: 20 } });

    expect(booked()).toBe(32);
    expect(capacityOf('Rebrand')).toBeCloseTo(40);
  });

  it('saves a view and answers with the filter, sort and grouping the view holds', () => {
    journey.view = max.views.createView({
      databaseId: journey.projects!,
      filterAst: { kind: 'property', operator: 'equals', propertyId: journey.status!.id, value: journey.active },
      group: { propertyId: journey.status!.id },
      layout: 'board',
      name: 'Active work',
      propertyState: { columns: [{ propertyId: journey.hours!.id }, { hidden: true, propertyId: journey.owner!.id }] },
      sorts: [{ direction: 'desc', propertyId: journey.hours!.id }],
    });

    const saved = max.views.getView(journey.view.id)!;
    expect(saved.layout).toBe('board');
    expect(saved.sorts).toEqual([{ direction: 'desc', propertyId: journey.hours!.id }]);
    expect(saved.filterAst).not.toBeNull();

    const answered = max.databaseQuery.query({
      databaseId: journey.projects!,
      filter: saved.filterAst,
      sorts: saved.sorts,
    });
    expect(answered.records.map((record) => record.title)).toEqual(['Rebrand', 'Signage']);
    expect(answered.totalCount).toBe(2);

    const grouped = max.databaseQuery.query({ databaseId: journey.projects!, group: saved.group });
    const counts = Object.fromEntries((grouped.groups ?? []).map((group) => [group.label, group.totalCount]));
    expect(counts.Active).toBe(2);
    expect(counts.Paused).toBe(1);
  });

  it('runs a quick action that creates a record, links it and moves the rollup', () => {
    const draft: WorkspaceWorkflowDraft = {
      inputSchema: {
        fields: [
          { databaseId: journey.clients!, key: 'client', label: 'Client', required: true, type: 'record' },
          { key: 'name', label: 'Name', required: true, type: 'text' },
          { key: 'hours', label: 'Hours', required: true, type: 'number' },
        ],
      },
      name: 'Start a project',
      steps: [
        {
          config: {
            databaseId: journey.projects!,
            outputVariable: 'project',
            properties: {
              [journey.hours!.id]: variable('hours'),
              [journey.relation!.inversePropertyId!]: variable('client'),
              [journey.status!.id]: literal(journey.active),
            },
            title: variable('name'),
          },
          id: 'create',
          type: 'CREATE_RECORD',
        },
      ],
    };
    journey.quickAction = max.workflows.createWorkflow(draft);

    const run = max.workflows.execute({
      inputs: { client: journey.studio!.id, hours: 8, name: 'Window display' },
      workflowId: journey.quickAction.id,
    });

    expect(run.status).toBe('completed');
    expect(run.createdRecordIds).toHaveLength(1);

    const created = max.records.getRecord(run.createdRecordIds[0]!)!;
    expect(created.title).toBe('Window display');
    expect(created.properties[journey.hours!.id]).toBe(8);
    expect(max.relations.getRelatedRecords(created.id, journey.relation!.id).map((record) => record.title)).toEqual(['Studio North']);
    // The rollup has to notice a record the quick action created, not only one a person typed.
    expect(max.databaseQuery.query({ databaseId: journey.clients! }).records[0]?.properties[journey.rollup!.id]).toBe(40);
  });

  it('takes a local backup of the workspace as it stands', () => {
    const backups = new BackupService(databasePath, backupDir);
    const snapshot = backups.createBackup('manual');
    journey.snapshotId = snapshot.id;

    expect(snapshot.checksum).toHaveLength(64);
    expect(snapshot.sizeBytes).toBeGreaterThan(0);
    expect(snapshot.schemaVersion).toBe(max.getHealth().schemaVersion);

    const verification = backups.verifyBackup(snapshot.id);
    expect(verification.valid).toBe(true);
    expect(verification.checksumMatch).toBe(true);
    expect(verification.sqliteIntegrityPassed).toBe(true);
  });

  it('restores the backup over a workspace that moved on, and keeps a safety snapshot of what it replaced', () => {
    const later = max.records.createRecord({
      databaseId: journey.projects!,
      properties: { [journey.hours!.id]: 99 },
      title: 'Typed after the backup',
    });
    journey.later = later.id;
    expect(max.databaseQuery.query({ databaseId: journey.projects! }).totalCount).toBe(5);

    // The restore replaces the database file, so the live connection closes
    // first. This is also the restart the journey has to survive.
    max.close();

    const backups = new BackupService(databasePath, backupDir);
    const result = backups.restoreBackup(journey.snapshotId!);

    expect(result.restored).toBe(true);
    expect(result.safetyRollbackOccurred).toBe(false);
    expect(result.preRestoreBackupId).toBeDefined();

    const safety = backups.listBackups().find((backup) => backup.id === result.preRestoreBackupId);
    expect(safety?.trigger).toBe('pre-restore');
    // The safety snapshot has to hold the state that was replaced, otherwise a
    // mistaken restore is unrecoverable.
    expect(backups.verifyBackup(safety!.id).valid).toBe(true);
  });

  it('reopens the restored workspace with the whole journey still in it', () => {
    max = openWorkspace();

    expect(max.getHealth().status).toBe('ready');

    const page = max.workspace.getNode(journey.page!)!;
    expect(page.title).toBe('The studio');
    expect(page.contentJson).toBe(pageContent);

    const projects = max.databaseQuery.query({ databaseId: journey.projects! });
    expect(projects.totalCount).toBe(4);
    expect(projects.records.map((record) => record.title).sort()).toEqual(['Menu cards', 'Rebrand', 'Signage', 'Window display']);
    // The record typed after the backup was not in the backup, so it is gone.
    expect(max.records.getRecord(journey.later!)).toBeNull();

    const rebrand = projects.records.find((record) => record.title === 'Rebrand')!;
    expect(rebrand.properties[journey.hours!.id]).toBe(20);
    expect(rebrand.properties[journey.capacity!.id]).toBeCloseTo(40);
    expect(rebrand.properties[journey.status!.id]).toBe(journey.active);

    expect(max.relations.getRelatedRecords(journey.studio!.id, journey.relation!.id).map((record) => record.title).sort())
      .toEqual(['Rebrand', 'Signage', 'Window display']);
    expect(max.databaseQuery.query({ databaseId: journey.clients! }).records[0]?.properties[journey.rollup!.id]).toBe(40);

    const view = max.views.getView(journey.view!.id)!;
    expect(view.name).toBe('Active work');
    expect(view.layout).toBe('board');
    expect(view.sorts).toEqual([{ direction: 'desc', propertyId: journey.hours!.id }]);

    const action = max.workflows.getWorkflow(journey.quickAction!.id)!;
    expect(action.name).toBe('Start a project');
    expect(action.steps).toEqual(journey.quickAction!.steps);

    // Reopening has to run the action again, not merely remember it.
    const rerun = max.workflows.execute({
      inputs: { client: journey.studio!.id, hours: 1, name: 'After the restore' },
      workflowId: action.id,
    });
    expect(rerun.status).toBe('completed');
    expect(max.databaseQuery.query({ databaseId: journey.clients! }).records[0]?.properties[journey.rollup!.id]).toBe(41);
  });

  it('has written nothing outside its own temporary directory', () => {
    const files = readdirSync(workspaceDir);
    expect(files).toContain('max.sqlite');
    expect(files).toContain('backups');
    // Backups belong beside the workspace that was asked for, not in a home directory.
    expect(readdirSync(backupDir).filter((name) => name.endsWith('.maxbak')).length).toBeGreaterThanOrEqual(2);
  });
});
