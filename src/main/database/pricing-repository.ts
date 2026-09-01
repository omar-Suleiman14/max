import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  calculationBases,
  calculatePricing,
  pricingCalculationTypes,
  pricingConditionFields,
  pricingConditionOperators,
  pricingComponentTypes,
  type PricingCalculation,
  type PricingComponent,
  type PricingProfile,
  type PricingProfileDraft,
  type PricingQuoteInput,
  type PricingSnapshot,
} from '../../shared/pricing-contract';
import { ObjectDomainError } from './object-repository';

type PricingProfileRow = Readonly<{
  active: number;
  channel: string | null;
  components_json: string;
  created_at: string;
  currency: 'EGP';
  id: string;
  input_mode: 'customer_pays' | 'customer_receives';
  name: string;
  provider: string | null;
  service: string | null;
  updated_at: string;
}>;

function optionalLabel(value: string | undefined, maximum: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maximum) throw new ObjectDomainError('invalid-input', `Value cannot exceed ${maximum} characters.`);
  return normalized;
}

function finite(value: number | undefined, label: string, minimum = 0): number | undefined {
  if (value === undefined) return undefined;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < minimum) {
    throw new ObjectDomainError('invalid-input', `${label} must be a finite number of at least ${minimum}.`);
  }
  return normalized;
}

function validateCalculation(calculation: PricingCalculation): PricingCalculation {
  if (!pricingCalculationTypes.includes(calculation.kind)) throw new ObjectDomainError('invalid-input', 'Invalid calculation type.');
  if (calculation.kind === 'conversion') {
    return { kind: 'conversion', rate: finite(calculation.rate, 'Conversion rate', Number.EPSILON) ?? 1 };
  }
  if (calculation.kind === 'lookup') {
    if (calculation.entries.length === 0) throw new ObjectDomainError('invalid-input', 'Lookup calculations need at least one row.');
    const entries = calculation.entries.map((entry) => ({
      customerPays: finite(entry.customerPays, 'Customer payment') ?? 0,
      deliveredValue: finite(entry.deliveredValue, 'Delivered value') ?? 0,
      label: optionalLabel(entry.label, 80),
      providerCost: finite(entry.providerCost, 'Provider cost'),
    }));
    return { entries, kind: 'lookup' };
  }
  if (calculation.kind === 'tiered') {
    if (calculation.mode !== 'banded' || calculation.tiers.length === 0) {
      throw new ObjectDomainError('invalid-input', 'Tiered calculations need at least one band.');
    }
    const tiers = calculation.tiers.map((tier) => ({
      calculation: validateCalculation(tier.calculation) as typeof tier.calculation,
      from: finite(tier.from, 'Tier start') ?? 0,
      to: finite(tier.to, 'Tier end'),
    })).sort((a, b) => a.from - b.from);
    tiers.forEach((tier, index) => {
      if (tier.to !== undefined && tier.to < tier.from) throw new ObjectDomainError('invalid-input', 'Tier end cannot precede tier start.');
      const previous = tiers[index - 1];
      if (previous && (previous.to === undefined || previous.to >= tier.from)) throw new ObjectDomainError('invalid-input', 'Pricing tiers cannot overlap.');
    });
    return { kind: 'tiered', mode: 'banded', tiers };
  }
  const rate = finite(calculation.rate, 'Percentage rate');
  if (rate !== undefined && rate > 1000) throw new ObjectDomainError('invalid-input', 'Percentage rate cannot exceed 1000%.');
  const minimum = finite(calculation.minimum, 'Minimum');
  const maximum = finite(calculation.maximum, 'Maximum');
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new ObjectDomainError('invalid-input', 'Minimum cannot exceed maximum.');
  }
  return {
    fixedAmount: finite(calculation.fixedAmount, 'Fixed amount'),
    kind: calculation.kind,
    maximum,
    minimum,
    rate,
  };
}

function validateComponent(component: PricingComponent): PricingComponent {
  if (!component.id || component.id.length > 120) throw new ObjectDomainError('invalid-input', 'Every pricing component needs a valid id.');
  const label = component.label.trim();
  if (!label || label.length > 120) throw new ObjectDomainError('invalid-input', 'Component label must contain 1–120 characters.');
  if (!pricingComponentTypes.includes(component.type)) throw new ObjectDomainError('invalid-input', 'Invalid pricing component type.');
  if (!calculationBases.includes(component.base)) throw new ObjectDomainError('invalid-input', 'Invalid calculation base.');
  if (!Number.isInteger(component.order) || !Number.isInteger(component.priority)) throw new ObjectDomainError('invalid-input', 'Order and priority must be whole numbers.');
  const calculation = validateCalculation(component.calculation);
  if (component.type === 'conversion' && calculation.kind !== 'conversion' && calculation.kind !== 'lookup') {
    throw new ObjectDomainError('invalid-input', 'Conversion components require conversion or lookup calculations.');
  }
  if (component.type !== 'conversion' && (calculation.kind === 'conversion' || calculation.kind === 'lookup')) {
    throw new ObjectDomainError('invalid-input', 'Conversion and lookup calculations belong to conversion components.');
  }
  const precision = component.rounding.precision;
  if (precision !== 0 && precision !== 2) throw new ObjectDomainError('invalid-input', 'Rounding precision must be pounds or piastres.');
  const increment = finite(component.rounding.increment, 'Rounding increment', Number.EPSILON);
  const conditions = component.conditions.map((condition) => {
    if (!pricingConditionFields.includes(condition.field) || !pricingConditionOperators.includes(condition.operator)) {
      throw new ObjectDomainError('invalid-input', 'Invalid pricing condition.');
    }
    if (!['boolean', 'number', 'string'].includes(typeof condition.value)) throw new ObjectDomainError('invalid-input', 'Pricing condition value is invalid.');
    return { ...condition };
  });
  return {
    ...component,
    baseComponentIds: component.base === 'custom_components' ? [...new Set(component.baseComponentIds ?? [])] : undefined,
    calculation,
    conditions,
    effectiveFrom: optionalLabel(component.effectiveFrom, 40),
    effectiveUntil: optionalLabel(component.effectiveUntil, 40),
    label,
    rounding: { increment, mode: component.rounding.mode, precision },
  };
}

function rowToProfile(row: PricingProfileRow): PricingProfile {
  return {
    active: row.active === 1,
    channel: row.channel ?? undefined,
    components: JSON.parse(row.components_json) as readonly PricingComponent[],
    createdAt: row.created_at,
    currency: row.currency,
    id: row.id,
    inputMode: row.input_mode,
    name: row.name,
    provider: row.provider ?? undefined,
    service: row.service ?? undefined,
    updatedAt: row.updated_at,
  };
}

export class PricingRepository {
  constructor(private readonly database: DatabaseSync) {}

  listProfiles(): readonly PricingProfile[] {
    const rows = this.database.prepare(`
      SELECT id, name, provider, channel, service, currency, input_mode, active, components_json, created_at, updated_at
      FROM pricing_profiles WHERE archived_at IS NULL ORDER BY active DESC, name COLLATE NOCASE
    `).all() as PricingProfileRow[];
    return rows.map(rowToProfile);
  }

  getProfile(id: string): PricingProfile {
    const row = this.database.prepare(`
      SELECT id, name, provider, channel, service, currency, input_mode, active, components_json, created_at, updated_at
      FROM pricing_profiles WHERE id = ? AND archived_at IS NULL
    `).get(id) as PricingProfileRow | undefined;
    if (!row) throw new ObjectDomainError('not-found', 'Pricing profile not found.');
    return rowToProfile(row);
  }

  createProfile(input: PricingProfileDraft): PricingProfile {
    const draft = this.#validateDraft(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    return this.#transaction(() => {
      try {
        this.database.prepare(`
          INSERT INTO pricing_profiles
            (id, name, provider, channel, service, currency, input_mode, active, components_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'EGP', ?, ?, ?, ?, ?)
        `).run(id, draft.name, draft.provider ?? null, draft.channel ?? null, draft.service ?? null, draft.inputMode, draft.active ? 1 : 0, JSON.stringify(draft.components), now, now);
      } catch (error) {
        if (/pricing_profiles_active_name/.test(String(error))) throw new ObjectDomainError('unique', 'A pricing profile with this name already exists.');
        throw error;
      }
      const created = this.getProfile(id);
      this.#audit(id, 'created', created, now);
      return created;
    });
  }

  updateProfile(id: string, input: PricingProfileDraft): PricingProfile {
    const previous = this.getProfile(id);
    const draft = this.#validateDraft(input);
    const now = new Date().toISOString();
    return this.#transaction(() => {
      this.database.prepare(`
        UPDATE pricing_profiles SET name = ?, provider = ?, channel = ?, service = ?, input_mode = ?, active = ?, components_json = ?, updated_at = ?
        WHERE id = ? AND archived_at IS NULL
      `).run(draft.name, draft.provider ?? null, draft.channel ?? null, draft.service ?? null, draft.inputMode, draft.active ? 1 : 0, JSON.stringify(draft.components), now, id);
      const updated = this.getProfile(id);
      this.#audit(id, 'updated', { previous, updated }, now);
      return updated;
    });
  }

  archiveProfile(id: string): void {
    const profile = this.getProfile(id);
    const now = new Date().toISOString();
    this.#transaction(() => {
      this.database.prepare('UPDATE pricing_profiles SET archived_at = ?, active = 0, updated_at = ? WHERE id = ?').run(now, now, id);
      this.#audit(id, 'archived', profile, now);
    });
  }

  quote(profileId: string, input: PricingQuoteInput): PricingSnapshot {
    return calculatePricing(this.getProfile(profileId), input);
  }

  #validateDraft(input: PricingProfileDraft): PricingProfileDraft {
    const name = input.name.trim();
    if (!name || name.length > 120) throw new ObjectDomainError('invalid-input', 'Pricing profile name must contain 1–120 characters.');
    if (input.currency !== 'EGP') throw new ObjectDomainError('invalid-input', 'Pricing currency must be EGP.');
    if (input.inputMode !== 'customer_pays' && input.inputMode !== 'customer_receives') throw new ObjectDomainError('invalid-input', 'Invalid pricing input mode.');
    const components = input.components.map(validateComponent);
    if (new Set(components.map(({ id }) => id)).size !== components.length) throw new ObjectDomainError('invalid-input', 'Component ids must be unique within a profile.');
    const componentIds = new Set(components.map(({ id }) => id));
    for (const component of components) {
      if (component.base === 'custom_components' && (!component.baseComponentIds?.length || component.baseComponentIds.some((id) => !componentIds.has(id) || id === component.id))) {
        throw new ObjectDomainError('invalid-input', 'Custom calculation bases must select other components from the same profile.');
      }
    }
    return {
      active: Boolean(input.active),
      channel: optionalLabel(input.channel, 120),
      components,
      currency: 'EGP',
      inputMode: input.inputMode,
      name,
      provider: optionalLabel(input.provider, 120),
      service: optionalLabel(input.service, 120),
    };
  }

  #audit(entityId: string, action: 'archived' | 'created' | 'updated', snapshot: unknown, now: string) {
    this.database.prepare(`
      INSERT INTO object_audit_log (entity_type, entity_id, action, actor, snapshot_json, created_at)
      VALUES ('pricing_profile', ?, ?, 'local-user', ?, ?)
    `).run(entityId, action, JSON.stringify(snapshot), now);
  }

  #transaction<T>(work: () => T): T {
    const nested = this.database.isTransaction;
    if (!nested) this.database.exec('BEGIN IMMEDIATE;');
    try {
      const result = work();
      if (!nested) this.database.exec('COMMIT;');
      return result;
    } catch (error) {
      if (!nested && this.database.isTransaction) this.database.exec('ROLLBACK;');
      throw error;
    }
  }
}
