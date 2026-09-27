import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseService } from '../../database/database-service';
import { ChaosService } from './chaos-service';
import { ChaosTokenStore, type SecretCipher } from './chaos-token-store';

const TOKEN = `chaos_${'a'.repeat(64)}`;
const ORIGIN = 'https://chaos.example.test';

/** Reversible stand-in for the OS cipher, so tests never touch a keyring. */
const cipher: SecretCipher = {
  decrypt: (data) => Buffer.from(data.toString('utf8'), 'base64').toString('utf8'),
  encrypt: (text) => Buffer.from(Buffer.from(text, 'utf8').toString('base64'), 'utf8'),
  isAvailable: () => true,
};

type Item = { id: string; kind: 'form' | 'quiz'; title: string; status: 'draft' | 'live'; revision: number; fields: unknown[]; responses: number };

/** A small in-memory Chaos that follows the v1 contract. */
function fakeChaos() {
  const items = new Map<string, Item>();
  const keys = new Map<string, { hash: string; status: number; body: unknown }>();
  const state = { offline: false, dropNextResponse: false, calls: 0 };
  const view = (item: Item) => ({
    createdByThisConnection: true, editPath: `/dashboard/forms/${item.id}`, editUrl: null, hasUnpublishedChanges: false, id: item.id, kind: item.kind,
    resultsPath: `/dashboard/forms/${item.id}/responses`, resultsUrl: null, revision: String(item.revision), sharePath: null, shareUrl: null,
    status: item.status, title: item.title, updatedAt: 1,
  });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });

  const fetchImpl: typeof fetch = async (input, init) => {
    await Promise.resolve();
    state.calls += 1;
    if (state.offline) throw new TypeError('fetch failed');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    if (headers.get('Authorization') !== `Bearer ${TOKEN}`) return json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } });
    const path = url.pathname.replace('/api/integrations/v1', '');
    const body = typeof init?.body === 'string' ? init.body : '';
    let response: Response;
    if (path === '/capabilities') {
      response = json(200, {
        apiVersion: '1', connection: { access: 'selected', createdAt: 1, expiresAt: null, id: 'tok1', label: 'Max' },
        fieldTypes: { form: ['text', 'choice'], quiz: ['mcq'] }, limits: { maxFields: 200, minimumGroupSize: 5 },
        scopes: ['items:read', 'drafts:create', 'drafts:update', 'summaries:read', 'definitions:read'], supportedKinds: ['form', 'quiz'], supportedVersions: ['1'],
        workspace: { id: 'w1', name: 'Casey' },
      });
    } else if (path === '/drafts' && method === 'POST') {
      const key = headers.get('Idempotency-Key') ?? '';
      const prior = keys.get(key);
      if (prior) response = prior.hash === body ? json(200, prior.body) : json(422, { error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'reused' } });
      else {
        const parsed = JSON.parse(body) as { kind: 'form'; title: string; fields: unknown[] };
        const item: Item = { fields: parsed.fields, id: `form_${items.size + 1}`, kind: parsed.kind, responses: 0, revision: 1, status: 'draft', title: parsed.title };
        items.set(item.id, item);
        const result = { item: view(item), warnings: [] };
        keys.set(key, { body: result, hash: body, status: 201 });
        response = json(201, result);
      }
    } else if (/^\/items\/[^/]+$/.test(path)) {
      const item = items.get(path.split('/')[2]!);
      if (!item) response = json(404, { error: { code: 'NOT_FOUND', message: 'missing' } });
      else if (method === 'GET') response = json(200, view(item));
      else if (headers.get('If-Match') !== String(item.revision)) response = json(409, { error: { code: 'REVISION_CONFLICT', details: { item: view(item) }, message: 'stale' } });
      else {
        const parsed = JSON.parse(body) as { title: string; fields: unknown[] };
        Object.assign(item, { fields: parsed.fields, revision: item.revision + 1, title: parsed.title });
        response = json(200, { item: view(item), warnings: [] });
      }
    } else if (/^\/items\/[^/]+\/summary$/.test(path)) {
      const item = items.get(path.split('/')[2]!)!;
      const suppressed = item.responses < 5;
      response = json(200, {
        averageScorePercent: null, completedCount: suppressed ? null : item.responses, itemId: item.id, kind: item.kind, minimumGroupSize: 5,
        questions: [], responseCount: suppressed ? null : item.responses, status: item.status, suppressed, updatedAt: 1,
      });
    } else if (/^\/items\/[^/]+\/definition$/.test(path)) {
      const item = items.get(path.split('/')[2]!)!;
      response = json(200, { compatibility: { dropped: [] }, fields: item.fields, kind: item.kind, title: item.title });
    } else {
      response = json(404, { error: { code: 'NOT_FOUND', message: 'unknown' } });
    }
    if (state.dropNextResponse) {
      state.dropNextResponse = false;
      throw new TypeError('connection reset');
    }
    return response;
  };
  return { fetchImpl, items, state };
}

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'max-chaos-'));
  cleanup.push(() => rmSync(dir, { force: true, recursive: true }));
  const database = new DatabaseService(':memory:');
  database.initialize();
  const chaos = fakeChaos();
  const tokenFile = join(dir, 'chaos-credentials.json');
  const service = new ChaosService({ fetchImpl: chaos.fetchImpl, repository: database.chaosLinks, tokens: new ChaosTokenStore(tokenFile, cipher) });
  const saved = await service.saveConnection(ORIGIN, TOKEN);
  expect(saved.ok).toBe(true);
  const page = database.workspace.createNode({ kind: 'page', title: 'Onboarding' });
  return { chaos, database, page, service, tokenFile };
}

const draft = { fields: [{ id: 'team', label: 'Team?', options: ['Sales', 'Support'], type: 'choice' as const }], kind: 'form' as const, source: { label: 'Onboarding' }, title: 'Onboarding survey' };

describe('ChaosService', () => {
  it('keeps the token out of the workspace database and the status', async () => {
    const { database, service, tokenFile } = await setup();
    const status = await service.getStatus();
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    expect(readFileSync(tokenFile, 'utf8')).not.toContain(TOKEN);
    const dump = JSON.stringify(database.chaosLinks.listConnectionIds());
    expect(dump).not.toContain(TOKEN);
  });

  it('retries a create whose answer was lost without creating a duplicate', async () => {
    const { chaos, page, service } = await setup();
    chaos.state.dropNextResponse = true;
    const first = await service.createDraft(page.id, draft);
    expect(first.ok).toBe(false);
    const pending = await service.listPendingOperations(page.id);
    expect(pending.ok && pending.value).toHaveLength(1);
    const retried = await service.retryOperation(pending.ok ? pending.value[0]!.id : '');
    expect(retried.ok).toBe(true);
    expect(chaos.items.size).toBe(1);
    const links = await service.listLinks(page.id);
    expect(links.ok && links.value).toHaveLength(1);
  });

  it('reports a revision conflict instead of overwriting, then overwrites on request', async () => {
    const { chaos, page, service } = await setup();
    const created = await service.createDraft(page.id, draft);
    if (!created.ok) throw new Error(created.error.message);
    const linkId = created.value.link.id;
    // Someone edits the draft in Chaos.
    const item = chaos.items.get(created.value.link.itemId)!;
    item.revision += 1;
    item.title = 'Edited in Chaos';
    const local = { fields: draft.fields, title: 'Edited in Max' };
    const conflict = await service.updateDraft(linkId, local);
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error.code).toBe('REVISION_CONFLICT');
    expect(conflict.error.currentItem?.title).toBe('Edited in Chaos');
    expect(item.title).toBe('Edited in Chaos');
    const overwrite = await service.updateDraft(linkId, local, conflict.error.currentItem?.revision);
    expect(overwrite.ok).toBe(true);
    expect(item.title).toBe('Edited in Max');
  });

  it('keeps cached cards when Chaos is unreachable and never shows small counts', async () => {
    const { chaos, page, service } = await setup();
    const created = await service.createDraft(page.id, draft);
    if (!created.ok) throw new Error(created.error.message);
    chaos.items.get(created.value.link.itemId)!.responses = 3;
    const refreshed = await service.refreshLinks(page.id, true);
    expect(refreshed.ok && refreshed.value.links[0]!.summary?.responseCount).toBeNull();
    chaos.state.offline = true;
    const offline = await service.refreshLinks(page.id, true);
    expect(offline.ok).toBe(true);
    const card = offline.ok ? offline.value.links[0]! : null;
    expect(card?.state).toBe('offline');
    expect(card?.item?.title).toBe('Onboarding survey');
  });

  it('unlinking never touches the Chaos item', async () => {
    const { chaos, page, service } = await setup();
    const created = await service.createDraft(page.id, draft);
    if (!created.ok) throw new Error(created.error.message);
    const calls = chaos.state.calls;
    await service.unlink(created.value.link.id);
    expect(chaos.state.calls).toBe(calls);
    expect(chaos.items.size).toBe(1);
  });
});
