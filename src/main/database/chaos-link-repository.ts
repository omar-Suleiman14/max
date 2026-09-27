import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

import {
  isChaosErrorCode,
  parseChaosItem,
  parseChaosLocalDefinitionInput,
  parseChaosSummary,
  type ChaosCapabilities,
  type ChaosDraftRequest,
  type ChaosDraftUpdateRequest,
  type ChaosErrorCode,
  type ChaosItem,
  type ChaosItemKind,
  type ChaosLinkState,
  type ChaosLocalDefinition,
  type ChaosScope,
  type ChaosSummary,
} from '../../shared/chaos-integration-contract';
import { DatabaseUnitOfWork } from './database-unit-of-work';

/**
 * Local records of the Chaos integration.
 *
 * What is stored: the connection's public details, page-to-item links, the
 * allow-listed item metadata and aggregate summary last fetched (with the time
 * they were fetched), Max's own copy of a field list it authored, and requests
 * not yet confirmed by Chaos. What is never stored: the token, respondent
 * answers or identities, or anything else from a Chaos response that the
 * contract validators did not keep.
 */

export type ChaosConnectionRecord = Readonly<{
  access: 'all' | 'selected';
  apiOrigin: string;
  capabilities: Pick<ChaosCapabilities, 'fieldTypes' | 'limits' | 'supportedKinds'>;
  connectionLabel: string;
  createdAt: string;
  id: string;
  lastCheckedAt: string | null;
  remoteConnectionId: string;
  scopes: readonly ChaosScope[];
  state: 'connected' | 'disconnected';
  updatedAt: string;
  workspaceId: string;
  workspaceName: string;
}>;

export type ChaosLinkRecord = Readonly<{
  connectionId: string;
  createdAt: string;
  id: string;
  item: ChaosItem | null;
  itemFetchedAt: string | null;
  itemId: string;
  kind: ChaosItemKind;
  lastAttemptAt: string | null;
  lastErrorCode: ChaosErrorCode | null;
  lastState: ChaosLinkState;
  localChanges: boolean;
  localDefinition: ChaosLocalDefinition | null;
  pageId: string;
  /** The definition as Max last sent it to Chaos (or read it from Chaos). */
  syncedDefinition: ChaosLocalDefinition | null;
  summary: ChaosSummary | null;
  summaryFetchedAt: string | null;
  syncedRevision: string | null;
  updatedAt: string;
}>;

export type ChaosOperationRecord = Readonly<{
  attempts: number;
  connectionId: string;
  createdAt: string;
  id: string;
  idempotencyKey: string;
  ifMatch: string | null;
  itemId: string | null;
  lastErrorCode: ChaosErrorCode | null;
  linkId: string | null;
  operation: 'create_draft' | 'update_draft';
  pageId: string;
  request: ChaosDraftRequest | ChaosDraftUpdateRequest;
}>;

type ConnectionRow = {
  access_mode: string; api_origin: string; capabilities_json: string; connection_label: string; created_at: string;
  id: string; last_checked_at: string | null; remote_connection_id: string; scopes_json: string; state: string;
  updated_at: string; workspace_id: string; workspace_name: string;
};

type LinkRow = {
  connection_id: string; created_at: string; id: string; item_fetched_at: string | null; item_id: string; item_json: string | null;
  kind: string; last_attempt_at: string | null; last_error_code: string | null; last_state: string; local_changes: number;
  local_definition_json: string | null; page_id: string; synced_definition_json: string | null; summary_fetched_at: string | null; summary_json: string | null;
  synced_revision: string | null; updated_at: string;
};

type OperationRow = {
  attempts: number; connection_id: string; created_at: string; id: string; idempotency_key: string; if_match: string | null;
  item_id: string | null; last_error_code: string | null; link_id: string | null; operation: string; page_id: string;
  request_json: string;
};

const LINK_STATES: readonly ChaosLinkState[] = ['ok', 'offline', 'unavailable', 'unauthorized', 'revoked', 'rate-limited', 'unsupported-version', 'insufficient-scope', 'disconnected', 'error'];

/** Cached JSON is validated again on the way out; a row that no longer parses reads as "not cached". */
function cached<T>(json: string | null, parse: (value: unknown) => T): T | null {
  if (!json) return null;
  try { return parse(JSON.parse(json)); } catch { return null; }
}

export class ChaosLinkRepository {
  readonly #database: DatabaseSync;
  readonly #unitOfWork: DatabaseUnitOfWork;

  constructor(database: DatabaseSync) {
    this.#database = database;
    this.#unitOfWork = new DatabaseUnitOfWork(database);
  }

  transaction<T>(work: () => T): T {
    return this.#unitOfWork.run(work);
  }

  // Connections ---------------------------------------------------------------

  #connection(row: ConnectionRow | undefined): ChaosConnectionRecord | null {
    if (!row) return null;
    const capabilities = cached(row.capabilities_json, (value) => value as ChaosConnectionRecord['capabilities']);
    return {
      access: row.access_mode === 'all' ? 'all' : 'selected',
      apiOrigin: row.api_origin,
      capabilities: capabilities ?? { fieldTypes: { form: [], quiz: [] }, limits: { maxFields: 200, minimumGroupSize: 5 }, supportedKinds: [] },
      connectionLabel: row.connection_label,
      createdAt: row.created_at,
      id: row.id,
      lastCheckedAt: row.last_checked_at,
      remoteConnectionId: row.remote_connection_id,
      scopes: cached(row.scopes_json, (value) => value as ChaosScope[]) ?? [],
      state: row.state === 'connected' ? 'connected' : 'disconnected',
      updatedAt: row.updated_at,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
    };
  }

  /** The connection in use, or the one most recently used when none is connected. */
  currentConnection(): ChaosConnectionRecord | null {
    return this.#connection(this.#database.prepare(`
      SELECT * FROM chaos_connections ORDER BY state = 'connected' DESC, updated_at DESC, id LIMIT 1
    `).get() as ConnectionRow | undefined);
  }

  getConnection(id: string): ChaosConnectionRecord | null {
    return this.#connection(this.#database.prepare('SELECT * FROM chaos_connections WHERE id = ?').get(id) as ConnectionRow | undefined);
  }

  listConnectionIds(): string[] {
    return (this.#database.prepare('SELECT id FROM chaos_connections').all() as { id: string }[]).map(({ id }) => id);
  }

  /**
   * Save a tested connection. Reconnecting to the same Chaos workspace reuses
   * its row, so links made before a disconnect come back to life. Only one
   * connection is active at a time.
   */
  saveConnection(apiOrigin: string, capabilities: ChaosCapabilities, now = new Date().toISOString()): ChaosConnectionRecord {
    return this.transaction(() => {
      const existing = this.#database.prepare('SELECT id FROM chaos_connections WHERE api_origin = ? AND workspace_id = ?')
        .get(apiOrigin, capabilities.workspace.id) as { id: string } | undefined;
      const id = existing?.id ?? randomUUID();
      this.#database.prepare("UPDATE chaos_connections SET state = 'disconnected', updated_at = ? WHERE id <> ? AND state = 'connected'").run(now, id);
      const stored = JSON.stringify({ fieldTypes: capabilities.fieldTypes, limits: capabilities.limits, supportedKinds: capabilities.supportedKinds });
      this.#database.prepare(`
        INSERT INTO chaos_connections (id, api_origin, workspace_id, workspace_name, remote_connection_id, connection_label, access_mode, scopes_json, capabilities_json, state, last_checked_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          workspace_name = excluded.workspace_name, remote_connection_id = excluded.remote_connection_id,
          connection_label = excluded.connection_label, access_mode = excluded.access_mode, scopes_json = excluded.scopes_json,
          capabilities_json = excluded.capabilities_json, state = 'connected', last_checked_at = excluded.last_checked_at,
          updated_at = excluded.updated_at
      `).run(id, apiOrigin, capabilities.workspace.id, capabilities.workspace.name, capabilities.connection.id, capabilities.connection.label,
        capabilities.connection.access, JSON.stringify(capabilities.scopes), stored, now, now, now);
      return this.getConnection(id) as ChaosConnectionRecord;
    });
  }

  setConnectionState(id: string, state: 'connected' | 'disconnected', now = new Date().toISOString()): void {
    this.#database.prepare('UPDATE chaos_connections SET state = ?, updated_at = ? WHERE id = ?').run(state, now, id);
  }

  // Links ---------------------------------------------------------------------

  #link(row: LinkRow | undefined): ChaosLinkRecord | null {
    if (!row) return null;
    return {
      connectionId: row.connection_id,
      createdAt: row.created_at,
      id: row.id,
      item: cached(row.item_json, (value) => parseChaosItem(value)),
      itemFetchedAt: row.item_fetched_at,
      itemId: row.item_id,
      kind: row.kind === 'quiz' ? 'quiz' : 'form',
      lastAttemptAt: row.last_attempt_at,
      lastErrorCode: isChaosErrorCode(row.last_error_code) ? row.last_error_code : null,
      lastState: (LINK_STATES as readonly string[]).includes(row.last_state) ? row.last_state as ChaosLinkState : 'ok',
      localChanges: row.local_changes === 1,
      localDefinition: cached(row.local_definition_json, parseChaosLocalDefinitionInput),
      pageId: row.page_id,
      summary: cached(row.summary_json, parseChaosSummary),
      syncedDefinition: cached(row.synced_definition_json, parseChaosLocalDefinitionInput),
      summaryFetchedAt: row.summary_fetched_at,
      syncedRevision: row.synced_revision,
      updatedAt: row.updated_at,
    };
  }

  listLinks(pageId: string): ChaosLinkRecord[] {
    return (this.#database.prepare('SELECT * FROM chaos_links WHERE page_id = ? ORDER BY created_at, id').all(pageId) as LinkRow[])
      .map((row) => this.#link(row) as ChaosLinkRecord);
  }

  getLink(id: string): ChaosLinkRecord | null {
    return this.#link(this.#database.prepare('SELECT * FROM chaos_links WHERE id = ?').get(id) as LinkRow | undefined);
  }

  findLink(pageId: string, connectionId: string, itemId: string): ChaosLinkRecord | null {
    return this.#link(this.#database.prepare('SELECT * FROM chaos_links WHERE page_id = ? AND connection_id = ? AND item_id = ?')
      .get(pageId, connectionId, itemId) as LinkRow | undefined);
  }

  pageExists(pageId: string): boolean {
    return Boolean(this.#database.prepare("SELECT 1 FROM workspace_nodes WHERE id = ? AND archived_at IS NULL").get(pageId));
  }

  insertLink(input: Readonly<{
    connectionId: string;
    item: ChaosItem;
    /** The field list Max just sent, when Max created the item. */
    syncedDefinition?: ChaosLocalDefinition;
    pageId: string;
  }>, now = new Date().toISOString()): ChaosLinkRecord {
    const existing = this.findLink(input.pageId, input.connectionId, input.item.id);
    const id = existing?.id ?? randomUUID();
    if (!existing) {
      this.#database.prepare(`
        INSERT INTO chaos_links (id, connection_id, page_id, item_id, kind, item_json, item_fetched_at, last_state, local_changes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ok', 0, ?, ?)
      `).run(id, input.connectionId, input.pageId, input.item.id, input.item.kind, JSON.stringify(input.item), now, now, now);
    } else {
      this.updateLinkCache(id, { item: input.item, itemFetchedAt: now, state: 'ok' }, now);
    }
    if (input.syncedDefinition) this.markSynced(id, input.syncedDefinition, input.item.revision, now);
    return this.getLink(id) as ChaosLinkRecord;
  }

  updateLinkCache(id: string, patch: Readonly<{
    errorCode?: ChaosErrorCode | null;
    item?: ChaosItem;
    itemFetchedAt?: string;
    state: ChaosLinkState;
    summary?: ChaosSummary | null;
    summaryFetchedAt?: string;
  }>, now = new Date().toISOString()): void {
    const current = this.getLink(id);
    if (!current) return;
    this.#database.prepare(`
      UPDATE chaos_links SET
        item_json = ?, item_fetched_at = ?, summary_json = ?, summary_fetched_at = ?,
        last_state = ?, last_error_code = ?, last_attempt_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      patch.item ? JSON.stringify(patch.item) : current.item ? JSON.stringify(current.item) : null,
      patch.itemFetchedAt ?? current.itemFetchedAt,
      patch.summary === undefined ? (current.summary ? JSON.stringify(current.summary) : null) : patch.summary ? JSON.stringify(patch.summary) : null,
      patch.summaryFetchedAt ?? current.summaryFetchedAt,
      patch.state,
      patch.errorCode ?? null,
      now,
      now,
      id,
    );
  }

  /** Keep Max's edited field list. It counts as a local change until it matches what Chaos last had. */
  saveLocalDefinition(id: string, definition: ChaosLocalDefinition, now = new Date().toISOString()): void {
    const current = this.getLink(id);
    if (!current) return;
    const changed = JSON.stringify(definition) !== JSON.stringify(current.syncedDefinition);
    this.#database.prepare('UPDATE chaos_links SET local_definition_json = ?, local_changes = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(definition), changed ? 1 : 0, now, id);
  }

  /** Chaos now holds `definition` at `revision`; local and synced copies agree. */
  markSynced(id: string, definition: ChaosLocalDefinition, revision: string, now = new Date().toISOString()): void {
    const json = JSON.stringify(definition);
    this.#database.prepare(`
      UPDATE chaos_links SET local_definition_json = ?, synced_definition_json = ?, synced_revision = ?, local_changes = 0, updated_at = ?
      WHERE id = ?
    `).run(json, json, revision, now, id);
  }

  /** Removes only Max's link. The Chaos item is untouched. */
  deleteLink(id: string): boolean {
    return Number(this.#database.prepare('DELETE FROM chaos_links WHERE id = ?').run(id).changes) > 0;
  }

  // Pending operations ----------------------------------------------------------

  #operation(row: OperationRow | undefined): ChaosOperationRecord | null {
    if (!row) return null;
    return {
      attempts: row.attempts,
      connectionId: row.connection_id,
      createdAt: row.created_at,
      id: row.id,
      idempotencyKey: row.idempotency_key,
      ifMatch: row.if_match,
      itemId: row.item_id,
      lastErrorCode: isChaosErrorCode(row.last_error_code) ? row.last_error_code : null,
      linkId: row.link_id,
      operation: row.operation === 'update_draft' ? 'update_draft' : 'create_draft',
      pageId: row.page_id,
      request: JSON.parse(row.request_json) as ChaosDraftRequest,
    };
  }

  /**
   * Record a request before it is sent. The idempotency key is generated here,
   * once, and every retry of this operation sends the same key and body.
   */
  insertOperation(input: Readonly<{
    connectionId: string;
    ifMatch?: string;
    itemId?: string;
    linkId?: string;
    operation: 'create_draft' | 'update_draft';
    pageId: string;
    request: ChaosDraftRequest | ChaosDraftUpdateRequest;
  }>, now = new Date().toISOString()): ChaosOperationRecord {
    const id = randomUUID();
    this.#database.prepare(`
      INSERT INTO chaos_pending_operations (id, connection_id, page_id, link_id, operation, item_id, idempotency_key, if_match, request_json, attempts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, input.connectionId, input.pageId, input.linkId ?? null, input.operation, input.itemId ?? null, `max-${randomUUID()}`,
      input.ifMatch ?? null, JSON.stringify(input.request), now, now);
    return this.getOperation(id) as ChaosOperationRecord;
  }

  getOperation(id: string): ChaosOperationRecord | null {
    return this.#operation(this.#database.prepare('SELECT * FROM chaos_pending_operations WHERE id = ?').get(id) as OperationRow | undefined);
  }

  listOperations(pageId: string): ChaosOperationRecord[] {
    return (this.#database.prepare('SELECT * FROM chaos_pending_operations WHERE page_id = ? ORDER BY created_at, id').all(pageId) as OperationRow[])
      .map((row) => this.#operation(row) as ChaosOperationRecord);
  }

  recordAttempt(id: string, errorCode: ChaosErrorCode | null, now = new Date().toISOString()): void {
    this.#database.prepare('UPDATE chaos_pending_operations SET attempts = attempts + 1, last_error_code = ?, updated_at = ? WHERE id = ?')
      .run(errorCode, now, id);
  }

  deleteOperationsForLink(linkId: string, operation: 'create_draft' | 'update_draft'): void {
    this.#database.prepare('DELETE FROM chaos_pending_operations WHERE link_id = ? AND operation = ?').run(linkId, operation);
  }

  deleteOperation(id: string): void {
    this.#database.prepare('DELETE FROM chaos_pending_operations WHERE id = ?').run(id);
  }
}
