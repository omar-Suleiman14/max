import { describe, expect, it } from 'vitest';

import type { PricingProfileDraft } from '../../shared/pricing-contract';
import { DatabaseService } from './database-service';

const component = {
  base: 'principal',
  calculation: { kind: 'percentage_min_max', maximum: 20, minimum: 0.5, rate: 0.1 },
  chargedTo: 'customer',
  conditions: [],
  id: 'instapay-fee',
  label: 'InstaPay fee',
  order: 10,
  priority: 0,
  rounding: { mode: 'nearest', precision: 2 },
  type: 'provider_fee',
} as const;

function draft(name = 'InstaPay transfer'): PricingProfileDraft {
  return {
    active: true,
    channel: 'InstaPay',
    components: [component],
    currency: 'EGP',
    inputMode: 'customer_pays',
    name,
    provider: 'InstaPay',
    service: 'Wallet transfer',
  };
}

describe('PricingRepository', () => {
  it('persists, updates, quotes, archives, and audits pricing profiles', () => {
    const db = new DatabaseService(':memory:');
    db.initialize();

    const created = db.pricing.createProfile(draft());
    expect(db.pricing.listProfiles()).toEqual([created]);
    expect(db.pricing.quote(created.id, { amount: 5000 }).totals).toMatchObject({ customerTotal: 5005, providerFee: 5 });

    const updated = db.pricing.updateProfile(created.id, { ...draft('InstaPay retail'), active: false });
    expect(updated).toMatchObject({ active: false, name: 'InstaPay retail' });

    const audit = db.objects.listAudit(created.id);
    expect(audit.map(({ action }) => action)).toEqual(['updated', 'created']);

    db.pricing.archiveProfile(created.id);
    expect(db.pricing.listProfiles()).toEqual([]);
    db.close();
  });

  it('stores conversion lookup rows as editable local data', () => {
    const db = new DatabaseService(':memory:');
    db.initialize();
    const created = db.pricing.createProfile({
      active: true,
      components: [{
        base: 'principal',
        calculation: { entries: [{ customerPays: 100, deliveredValue: 70, providerCost: 98 }], kind: 'lookup' },
        chargedTo: 'customer',
        conditions: [],
        id: 'recharge-table',
        label: 'Recharge table',
        order: 10,
        priority: 0,
        rounding: { mode: 'nearest', precision: 2 },
        type: 'conversion',
      }],
      currency: 'EGP',
      inputMode: 'customer_pays',
      name: 'Mobile recharge',
      provider: 'Vodafone',
      service: 'Recharge',
    });

    expect(db.pricing.quote(created.id, { amount: 100 }).totals).toMatchObject({
      customerTotal: 100,
      deliveredValue: 70,
      providerCost: 98,
      shopNetCost: 98,
    });
    db.close();
  });
});
