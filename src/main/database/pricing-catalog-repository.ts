import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { accountTypes } from '../../shared/account-contract';
import {
  pricingServiceOperations,
  type PricingChannel,
  type PricingChannelDraft,
  type PricingProvider,
  type PricingProviderDraft,
  type PricingService,
  type PricingServiceDraft,
} from '../../shared/pricing-contract';
import { ObjectDomainError } from './object-repository';

type ProviderRow = Readonly<{ active: number; created_at: string; id: string; name: string; updated_at: string }>;
type ChannelRow = Readonly<{ active: number; created_at: string; id: string; name: string; provider_id: string | null; updated_at: string }>;
type ServiceRow = Readonly<{
  active: number;
  category: string;
  channel_id: string | null;
  created_at: string;
  default_input_mode: PricingServiceDraft['defaultInputMode'];
  id: string;
  input_label: string;
  input_modes_json: string;
  name: string;
  operation_kind: PricingServiceDraft['operation'];
  payment_account_types_json: string;
  pricing_profile_id: string;
  provider_id: string | null;
  updated_at: string;
}>;

function label(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > maximum) {
    throw new ObjectDomainError('invalid-input', `${field} must contain 1–${maximum} characters.`);
  }
  return value.trim();
}

function optionalId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 120) throw new ObjectDomainError('invalid-input', `${field} is invalid.`);
  return value;
}

function providerFromRow(row: ProviderRow): PricingProvider {
  return { active: row.active === 1, createdAt: row.created_at, id: row.id, name: row.name, updatedAt: row.updated_at };
}

function channelFromRow(row: ChannelRow): PricingChannel {
  return { active: row.active === 1, createdAt: row.created_at, id: row.id, name: row.name, providerId: row.provider_id ?? undefined, updatedAt: row.updated_at };
}

function serviceFromRow(row: ServiceRow): PricingService {
  return {
    active: row.active === 1,
    category: row.category,
    channelId: row.channel_id ?? undefined,
    createdAt: row.created_at,
    defaultInputMode: row.default_input_mode,
    id: row.id,
    inputLabel: row.input_label,
    inputModes: JSON.parse(row.input_modes_json) as PricingService['inputModes'],
    name: row.name,
    operation: row.operation_kind,
    paymentAccountTypes: JSON.parse(row.payment_account_types_json) as PricingService['paymentAccountTypes'],
    pricingProfileId: row.pricing_profile_id,
    providerId: row.provider_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

export class PricingCatalogRepository {
  constructor(private readonly database: DatabaseSync) {}

  listProviders(): readonly PricingProvider[] {
    return (this.database.prepare('SELECT id, name, active, created_at, updated_at FROM pricing_providers WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE').all() as ProviderRow[]).map(providerFromRow);
  }

  listChannels(): readonly PricingChannel[] {
    return (this.database.prepare('SELECT id, name, provider_id, active, created_at, updated_at FROM pricing_channels WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE').all() as ChannelRow[]).map(channelFromRow);
  }

  listServices(): readonly PricingService[] {
    return (this.database.prepare(`
      SELECT id, name, category, provider_id, channel_id, pricing_profile_id, operation_kind, input_label,
             input_modes_json, default_input_mode, payment_account_types_json, active, created_at, updated_at
      FROM pricing_services WHERE archived_at IS NULL ORDER BY category COLLATE NOCASE, name COLLATE NOCASE
    `).all() as ServiceRow[]).map(serviceFromRow);
  }

  getService(id: string): PricingService {
    const row = this.database.prepare(`
      SELECT id, name, category, provider_id, channel_id, pricing_profile_id, operation_kind, input_label,
             input_modes_json, default_input_mode, payment_account_types_json, active, created_at, updated_at
      FROM pricing_services WHERE id = ? AND archived_at IS NULL
    `).get(id) as ServiceRow | undefined;
    if (!row) throw new ObjectDomainError('not-found', 'Pricing service not found.');
    return serviceFromRow(row);
  }

  createProvider(input: PricingProviderDraft): PricingProvider {
    const draft = this.#providerDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    return this.#transaction(() => {
      this.#runUnique(() => this.database.prepare('INSERT INTO pricing_providers (id, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, draft.name, draft.active ? 1 : 0, now, now), 'A provider with this name already exists.');
      const created = this.listProviders().find((provider) => provider.id === id)!;
      this.#audit('pricing_provider', id, 'created', created, now);
      return created;
    });
  }

  updateProvider(id: string, input: PricingProviderDraft): PricingProvider {
    const previous = this.listProviders().find((provider) => provider.id === id);
    if (!previous) throw new ObjectDomainError('not-found', 'Pricing provider not found.');
    const draft = this.#providerDraft(input);
    const now = new Date().toISOString();
    return this.#transaction(() => {
      this.#runUnique(() => this.database.prepare('UPDATE pricing_providers SET name = ?, active = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL').run(draft.name, draft.active ? 1 : 0, now, id), 'A provider with this name already exists.');
      const updated = this.listProviders().find((provider) => provider.id === id)!;
      this.#audit('pricing_provider', id, 'updated', { previous, updated }, now);
      return updated;
    });
  }

  createChannel(input: PricingChannelDraft): PricingChannel {
    const draft = this.#channelDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    return this.#transaction(() => {
      this.#runUnique(() => this.database.prepare('INSERT INTO pricing_channels (id, name, provider_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, draft.name, draft.providerId ?? null, draft.active ? 1 : 0, now, now), 'This channel already exists for the provider.');
      const created = this.listChannels().find((channel) => channel.id === id)!;
      this.#audit('pricing_channel', id, 'created', created, now);
      return created;
    });
  }

  updateChannel(id: string, input: PricingChannelDraft): PricingChannel {
    const previous = this.listChannels().find((channel) => channel.id === id);
    if (!previous) throw new ObjectDomainError('not-found', 'Pricing channel not found.');
    const draft = this.#channelDraft(input);
    const now = new Date().toISOString();
    return this.#transaction(() => {
      this.#runUnique(() => this.database.prepare('UPDATE pricing_channels SET name = ?, provider_id = ?, active = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL').run(draft.name, draft.providerId ?? null, draft.active ? 1 : 0, now, id), 'This channel already exists for the provider.');
      const updated = this.listChannels().find((channel) => channel.id === id)!;
      this.#audit('pricing_channel', id, 'updated', { previous, updated }, now);
      return updated;
    });
  }

  createService(input: PricingServiceDraft): PricingService {
    const draft = this.#serviceDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    return this.#transaction(() => {
      this.#runUnique(() => this.database.prepare(`
        INSERT INTO pricing_services (id, name, category, provider_id, channel_id, pricing_profile_id, operation_kind,
          input_label, input_modes_json, default_input_mode, payment_account_types_json, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, draft.name, draft.category, draft.providerId ?? null, draft.channelId ?? null, draft.pricingProfileId, draft.operation, draft.inputLabel, JSON.stringify(draft.inputModes), draft.defaultInputMode, JSON.stringify(draft.paymentAccountTypes), draft.active ? 1 : 0, now, now), 'A service with this name already exists.');
      const created = this.getService(id);
      this.#audit('pricing_service', id, 'created', created, now);
      return created;
    });
  }

  updateService(id: string, input: PricingServiceDraft): PricingService {
    const previous = this.getService(id);
    const draft = this.#serviceDraft(input);
    const now = new Date().toISOString();
    return this.#transaction(() => {
      this.#runUnique(() => this.database.prepare(`
        UPDATE pricing_services SET name = ?, category = ?, provider_id = ?, channel_id = ?, pricing_profile_id = ?,
          operation_kind = ?, input_label = ?, input_modes_json = ?, default_input_mode = ?, payment_account_types_json = ?,
          active = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL
      `).run(draft.name, draft.category, draft.providerId ?? null, draft.channelId ?? null, draft.pricingProfileId, draft.operation, draft.inputLabel, JSON.stringify(draft.inputModes), draft.defaultInputMode, JSON.stringify(draft.paymentAccountTypes), draft.active ? 1 : 0, now, id), 'A service with this name already exists.');
      const updated = this.getService(id);
      this.#audit('pricing_service', id, 'updated', { previous, updated }, now);
      return updated;
    });
  }

  archiveProvider(id: string): void { this.#archive('pricing_providers', 'pricing_provider', id); }
  archiveChannel(id: string): void { this.#archive('pricing_channels', 'pricing_channel', id); }
  archiveService(id: string): void { this.#archive('pricing_services', 'pricing_service', id); }

  #providerDraft(input: PricingProviderDraft): PricingProviderDraft {
    return { active: input.active === true, name: label(input.name, 'Provider name', 120) };
  }

  #channelDraft(input: PricingChannelDraft): PricingChannelDraft {
    return { active: input.active === true, name: label(input.name, 'Channel name', 120), providerId: optionalId(input.providerId, 'Provider') };
  }

  #serviceDraft(input: PricingServiceDraft): PricingServiceDraft {
    if (!pricingServiceOperations.includes(input.operation)) throw new ObjectDomainError('invalid-input', 'Invalid service operation.');
    const inputModes = [...new Set(input.inputModes)].filter((mode) => mode === 'customer_pays' || mode === 'customer_receives');
    if (inputModes.length < 1 || !inputModes.includes(input.defaultInputMode)) throw new ObjectDomainError('invalid-input', 'Service input modes must include the default mode.');
    const paymentAccountTypes = [...new Set(input.paymentAccountTypes)].filter((type) => accountTypes.includes(type));
    if (paymentAccountTypes.length < 1) throw new ObjectDomainError('invalid-input', 'Select at least one payment account type.');
    return {
      active: input.active === true,
      category: label(input.category, 'Service category', 80),
      channelId: optionalId(input.channelId, 'Channel'),
      defaultInputMode: input.defaultInputMode,
      inputLabel: label(input.inputLabel, 'Input label', 120),
      inputModes,
      name: label(input.name, 'Service name', 120),
      operation: input.operation,
      paymentAccountTypes,
      pricingProfileId: optionalId(input.pricingProfileId, 'Pricing profile') ?? (() => { throw new ObjectDomainError('invalid-input', 'Pricing profile is required.'); })(),
      providerId: optionalId(input.providerId, 'Provider'),
    };
  }

  #archive(table: 'pricing_channels' | 'pricing_providers' | 'pricing_services', entityType: 'pricing_channel' | 'pricing_provider' | 'pricing_service', id: string): void {
    const now = new Date().toISOString();
    const result = this.database.prepare(`UPDATE ${table} SET archived_at = ?, active = 0, updated_at = ? WHERE id = ? AND archived_at IS NULL`).run(now, now, id);
    if (result.changes === 0) throw new ObjectDomainError('not-found', 'Pricing catalog entry not found.');
    this.#audit(entityType, id, 'archived', { id }, now);
  }

  #audit(entityType: 'pricing_channel' | 'pricing_provider' | 'pricing_service', id: string, action: 'archived' | 'created' | 'updated', snapshot: unknown, now: string) {
    this.database.prepare(`INSERT INTO object_audit_log (entity_type, entity_id, action, actor, snapshot_json, created_at) VALUES (?, ?, ?, 'local-user', ?, ?)`).run(entityType, id, action, JSON.stringify(snapshot), now);
  }

  #runUnique(work: () => unknown, message: string) {
    try { work(); } catch (error) { if (/UNIQUE constraint failed/.test(String(error))) throw new ObjectDomainError('unique', message); throw error; }
  }

  #transaction<T>(work: () => T): T {
    const nested = this.database.isTransaction;
    if (!nested) this.database.exec('BEGIN IMMEDIATE;');
    try { const result = work(); if (!nested) this.database.exec('COMMIT;'); return result; }
    catch (error) { if (!nested && this.database.isTransaction) this.database.exec('ROLLBACK;'); throw error; }
  }
}
