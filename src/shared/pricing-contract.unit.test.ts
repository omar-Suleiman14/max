import { describe, expect, it } from 'vitest';

import { calculatePricing, roundPricingAmount, type PricingComponent, type PricingProfile } from './pricing-contract';

const rounding = { mode: 'nearest', precision: 2 } as const;
const component = (input: Partial<PricingComponent> & Pick<PricingComponent, 'calculation' | 'id' | 'label' | 'type'>): PricingComponent => ({
  base: 'principal', chargedTo: 'customer', conditions: [], order: 10, priority: 0, rounding, ...input,
});
const profile = (components: readonly PricingComponent[], inputMode: PricingProfile['inputMode'] = 'customer_pays'): PricingProfile => ({
  active: true, components, createdAt: '2026-08-31T00:00:00.000Z', currency: 'EGP', id: 'profile', inputMode,
  name: 'Test pricing', updatedAt: '2026-08-31T00:00:00.000Z',
});

describe('pricing engine', () => {
  it('separates customer total, shop cost, markup, and provider commission', () => {
    const quote = calculatePricing(profile([
      component({ calculation: { fixedAmount: 5, kind: 'fixed' }, id: 'provider-fee', label: 'Provider fee', type: 'provider_fee' }),
      component({ calculation: { fixedAmount: 3, kind: 'fixed' }, id: 'profit', label: 'Profit', order: 20, type: 'profit' }),
      component({ calculation: { fixedAmount: 2, kind: 'fixed' }, chargedTo: 'provider', id: 'commission', label: 'Commission', order: 30, paidTo: 'shop', type: 'commission' }),
    ]), { amount: 500, providerCost: 505 }, '2026-08-31T12:00:00.000Z');

    expect(quote.totals).toMatchObject({ customerTotal: 508, netProfit: 5, profitMarkup: 3, providerCommission: 2, shopNetCost: 503 });
  });

  it('supports min/max, fixed plus percentage, and banded tiers', () => {
    const quote = calculatePricing(profile([
      component({ calculation: { kind: 'percentage_min_max', maximum: 20, minimum: 0.5, rate: 0.1 }, id: 'instapay', label: 'InstaPay', type: 'provider_fee' }),
      component({ calculation: { fixedAmount: 2, kind: 'fixed_plus_percentage', rate: 0.5 }, id: 'mixed', label: 'Mixed', order: 20, type: 'customer_fee' }),
      component({ calculation: { kind: 'tiered', mode: 'banded', tiers: [
        { calculation: { fixedAmount: 3, kind: 'fixed' }, from: 0, to: 500 },
        { calculation: { fixedAmount: 5, kind: 'fixed' }, from: 500.01, to: 2000 },
        { calculation: { kind: 'percentage', rate: 1 }, from: 2000.01 },
      ] }, id: 'tier', label: 'Tier', order: 30, type: 'profit' }),
    ]), { amount: 5000 });

    expect(quote.totals.providerFee).toBe(5);
    expect(quote.totals.customerFee).toBe(27);
    expect(quote.totals.profitMarkup).toBe(50);
    expect(quote.totals.customerTotal).toBe(5082);
  });

  it('calculates inclusive and exclusive tax differently', () => {
    const inclusive = calculatePricing(profile([component({ calculation: { kind: 'percentage', rate: 14 }, id: 'vat', label: 'VAT', taxMode: 'inclusive', type: 'tax' })]), { amount: 100 });
    const exclusive = calculatePricing(profile([component({ calculation: { kind: 'percentage', rate: 14 }, id: 'vat', label: 'VAT', taxMode: 'exclusive', type: 'tax' })]), { amount: 100 });
    expect(inclusive.totals).toMatchObject({ customerTotal: 100, taxAmount: 12.28 });
    expect(exclusive.totals).toMatchObject({ customerTotal: 114, taxAmount: 14 });
  });

  it('calculates recharge forward and in reverse with configurable conversion and rounding', () => {
    const recharge = profile([
      component({ calculation: { kind: 'conversion', rate: 0.7 }, id: 'conversion', label: 'Delivered credit', rounding: { mode: 'up', precision: 2 }, type: 'conversion' }),
      component({ calculation: { kind: 'percentage', rate: 2 }, chargedTo: 'provider', id: 'commission', label: 'Commission', paidTo: 'shop', type: 'commission' }),
    ]);
    expect(calculatePricing(recharge, { amount: 100, providerCost: 100 }).totals).toMatchObject({ deliveredValue: 70, netProfit: 2, providerCommission: 2 });
    expect(calculatePricing(recharge, { amount: 100, inputMode: 'customer_receives', providerCost: 142.86 }).totals.principalAmount).toBe(142.86);
  });

  it('uses lookup tables, conditions, order, and audited overrides', () => {
    const lookup = component({ calculation: { entries: [{ customerPays: 10, deliveredValue: 7, providerCost: 9.8 }], kind: 'lookup' }, id: 'lookup', label: 'Recharge table', type: 'conversion' });
    const profit = component({ calculation: { fixedAmount: 5, kind: 'fixed' }, conditions: [{ field: 'amount', operator: 'gte', value: 10 }], id: 'profit', label: 'Profit', order: 20, type: 'profit' });
    const quote = calculatePricing(profile([lookup, profit]), { amount: 10, overrides: [{ actor: 'Omar', amount: 3, componentId: 'profit', reason: 'Regular customer' }] });
    expect(quote.totals).toMatchObject({ customerTotal: 13, deliveredValue: 7, netProfit: 3.2, providerCost: 9.8, shopNetCost: 9.8 });
    expect(quote.componentResults[0]?.override?.reason).toBe('Regular customer');
  });

  it('supports piastre, whole-pound, and increment rounding', () => {
    expect(roundPricingAmount(14.285714, { mode: 'nearest', precision: 2 })).toBe(14.29);
    expect(roundPricingAmount(14.01, { mode: 'up', precision: 0 })).toBe(15);
    expect(roundPricingAmount(14.26, { increment: 0.5, mode: 'nearest', precision: 2 })).toBe(14.5);
  });

  it('uses profile context and date-only effective windows', () => {
    const datedProfile = {
      ...profile([component({
        calculation: { fixedAmount: 3, kind: 'fixed' },
        conditions: [
          { field: 'service', operator: 'eq', value: 'Electricity' },
          { field: 'channel', operator: 'eq', value: 'Fawry' },
        ],
        effectiveFrom: '2026-08-01',
        effectiveUntil: '2026-08-31',
        id: 'seasonal-profit',
        label: 'Seasonal profit',
        type: 'profit',
      })]),
      channel: 'Fawry',
      service: 'Electricity',
    };

    expect(calculatePricing(datedProfile, { amount: 100 }, '2026-08-31T23:30:00.000Z').totals.profitMarkup).toBe(3);
    expect(calculatePricing(datedProfile, { amount: 100 }, '2026-09-01T00:00:00.000Z').totals.profitMarkup).toBe(0);
  });

  it('rejects unaudited or unknown manual overrides', () => {
    const priced = profile([component({ calculation: { fixedAmount: 5, kind: 'fixed' }, id: 'profit', label: 'Profit', type: 'profit' })]);
    expect(() => calculatePricing(priced, { amount: 100, overrides: [{ actor: 'Omar', amount: 3, componentId: 'profit', reason: ' ' }] })).toThrow('requires a reason');
    expect(() => calculatePricing(priced, { amount: 100, overrides: [{ actor: 'Omar', amount: 3, componentId: 'missing', reason: 'Regular customer' }] })).toThrow('not found');
  });

  it('supports tax applied to selected pricing components only', () => {
    const quote = calculatePricing(profile([
      component({ calculation: { fixedAmount: 5, kind: 'fixed' }, id: 'provider-fee', label: 'Provider fee', type: 'provider_fee' }),
      component({ calculation: { fixedAmount: 3, kind: 'fixed' }, id: 'profit', label: 'Profit', order: 20, type: 'profit' }),
      component({ base: 'custom_components', baseComponentIds: ['provider-fee'], calculation: { kind: 'percentage', rate: 14 }, id: 'vat', label: 'VAT on fee', order: 30, taxMode: 'exclusive', type: 'tax' }),
    ]), { amount: 100 });
    expect(quote.totals).toMatchObject({ customerTotal: 108.7, taxAmount: 0.7 });
    expect(quote.componentResults.find(({ componentId }) => componentId === 'vat')?.baseAmount).toBe(5);
  });
});
