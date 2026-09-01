import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database-service';

const component = {
  base: 'principal', calculation: { fixedAmount: 3, kind: 'fixed' }, chargedTo: 'customer', conditions: [],
  id: 'profit', label: 'Profit', order: 10, priority: 0, rounding: { mode: 'nearest', precision: 2 }, type: 'profit',
} as const;

function database() {
  const db = new DatabaseService(':memory:');
  db.initialize();
  return db;
}

describe('PricingCatalogRepository', () => {
  it('persists editable provider, channel, and service templates with audited hierarchy', () => {
    const db = database();
    const profile = db.pricing.createProfile({ active: true, components: [component], currency: 'EGP', inputMode: 'customer_pays', name: 'Utility pricing' });
    const provider = db.pricingCatalog.createProvider({ active: true, name: 'Fawry' });
    const channel = db.pricingCatalog.createChannel({ active: true, name: 'POS', providerId: provider.id });
    const service = db.pricingCatalog.createService({
      active: true, category: 'Utility', channelId: channel.id, defaultInputMode: 'customer_pays', inputLabel: 'Bill amount',
      inputModes: ['customer_pays'], name: 'Electricity bill', operation: 'sale', paymentAccountTypes: ['cash', 'wallet'],
      pricingProfileId: profile.id, providerId: provider.id,
    });

    expect(db.pricingCatalog.getService(service.id)).toMatchObject({ channelId: channel.id, pricingProfileId: profile.id, providerId: provider.id });
    expect(db.pricingCatalog.updateProvider(provider.id, { active: true, name: 'Fawry Egypt' }).name).toBe('Fawry Egypt');
    expect(db.pricingCatalog.updateChannel(channel.id, { active: true, name: 'Counter', providerId: provider.id }).name).toBe('Counter');
    expect(db.pricingCatalog.updateService(service.id, { ...service, inputModes: ['customer_pays', 'customer_receives'] }).inputModes).toEqual(['customer_pays', 'customer_receives']);
    expect(db.objects.listAudit(service.id).map(({ action }) => action)).toEqual(['updated', 'created']);
    db.pricingCatalog.archiveService(service.id);
    expect(db.pricingCatalog.listServices()).toEqual([]);
    db.close();
  });

  it('links accounts to providers for source and destination pricing conditions', () => {
    const db = database();
    const provider = db.pricingCatalog.createProvider({ active: true, name: 'Vodafone' });
    const account = db.accounts.createAccount({ accountType: 'wallet', initialBalance: 0, name: 'Vodafone Cash', providerId: provider.id });
    expect(account.providerId).toBe(provider.id);
    expect(db.accounts.getAccount(account.id).providerId).toBe(provider.id);
    db.close();
  });
});
