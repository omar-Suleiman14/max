import type { DatabaseSync } from 'node:sqlite';

import type {
  QuickEntryDraft,
  QuickEntryPriceSuggestion,
} from '../../shared/quick-entry-contract';
import type { TransactionRecord } from '../../shared/transaction-contract';
import type { TransactionPricing } from '../../shared/transaction-contract';
import { ObjectDomainError } from './object-repository';
import type { TransactionRepository } from './transaction-repository';
import type { PricingRepository } from './pricing-repository';
import type { PricingCatalogRepository } from './pricing-catalog-repository';
import type { AccountRepository } from './account-repository';

export class QuickEntryService {
  constructor(
    private readonly database: DatabaseSync,
    private readonly transactions: TransactionRepository,
    private readonly pricing: PricingRepository,
    private readonly pricingCatalog: PricingCatalogRepository,
    private readonly accounts: AccountRepository,
  ) {}

  previewPricing(draft: QuickEntryDraft) {
    return this.#calculatePricing(draft, draft.totalAmount)?.snapshot ?? null;
  }

  getSuggestion(itemId?: string, templateId?: string): QuickEntryPriceSuggestion {
    // 1. Explicit item price
    if (itemId) {
      const itemPriceRow = this.database
        .prepare(`
          SELECT v.value_json
          FROM object_property_values v
          JOIN object_properties p ON p.id = v.property_id
          WHERE v.record_id = ? AND v.active = 1
            AND (p.semantic_role = 'PRICE' OR p.property_type = 'money' OR p.name COLLATE NOCASE IN ('Selling Price', 'Price', 'Amount', 'Cost Price', 'سعر البيع', 'السعر'))
          ORDER BY (CASE WHEN p.semantic_role = 'PRICE' THEN 0 WHEN p.name COLLATE NOCASE = 'Selling Price' THEN 1 WHEN p.name COLLATE NOCASE = 'Price' THEN 2 ELSE 3 END)
          LIMIT 1
        `)
        .get(itemId) as { value_json: string } | undefined;

      if (itemPriceRow) {
        try {
          const val = JSON.parse(itemPriceRow.value_json) as unknown;
          const num = Number(val);
          if (Number.isFinite(num) && num > 0) {
            return {
              amount: Math.round(num * 100) / 100,
              source: 'item-price',
            };
          }
        } catch {
          // ignore parse error
        }
      }
    }

    // 2. Template default
    if (templateId) {
      const templateRow = this.database
        .prepare('SELECT defaults_json FROM shop_templates WHERE id = ? AND archived_at IS NULL')
        .get(templateId) as { defaults_json: string } | undefined;

      if (templateRow) {
        try {
          const defaults = JSON.parse(templateRow.defaults_json) as Record<string, unknown>;
          for (const [key, val] of Object.entries(defaults)) {
            if (/price|amount|selling/i.test(key)) {
              const num = Number(val);
              if (Number.isFinite(num) && num > 0) {
                return {
                  amount: Math.round(num * 100) / 100,
                  source: 'template-default',
                };
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // 3. Last historical transaction for this product
    if (itemId) {
      const lastTxRow = this.database
        .prepare(`
          SELECT t.total_amount, m.account_id
          FROM shop_transactions t
          LEFT JOIN shop_money_movements m ON m.transaction_id = t.id AND m.archived_at IS NULL
          WHERE t.item_id = ? AND t.archived_at IS NULL AND t.reversed_at IS NULL AND t.transaction_type = 'sale'
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT 1
        `)
        .get(itemId) as { account_id: string | null; total_amount: number } | undefined;

      if (lastTxRow && lastTxRow.total_amount > 0) {
        return {
          amount: Math.round(lastTxRow.total_amount * 100) / 100,
          lastAccountId: lastTxRow.account_id ?? undefined,
          source: 'historical-last',
        };
      }
    }

    // 4. Fallback: most recent payment account in the shop
    const lastAccountRow = this.database
      .prepare(`
        SELECT account_id
        FROM shop_money_movements
        WHERE archived_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `)
      .get() as { account_id: string } | undefined;

    return {
      amount: null,
      lastAccountId: lastAccountRow?.account_id ?? undefined,
      source: 'none',
    };
  }

  submit(draft: QuickEntryDraft): TransactionRecord {
    const total = Number(draft.totalAmount);
    if (!Number.isFinite(total) || total <= 0) {
      throw new ObjectDomainError('invalid-input', 'Total amount must be greater than zero.');
    }

    const operationKind = draft.operationKind ?? 'sale';
    const quantity = draft.quantity ? Math.max(1, Math.round(Number(draft.quantity))) : undefined;
    const pricing = this.#calculatePricing(draft, total);

    if (operationKind === 'sale') {
      return this.#submitSale(draft, pricing?.customerTotal ?? total, quantity, pricing);
    }
    if (operationKind === 'purchase') {
      return this.#submitPurchase(draft, pricing?.shopNetCost ?? total, quantity, pricing);
    }
    if (operationKind === 'expense') {
      return this.#submitExpense(draft, pricing?.shopNetCost ?? total, pricing);
    }
    if (operationKind === 'income') {
      return this.#submitIncome(draft, pricing?.customerTotal ?? total, pricing);
    }
    if (operationKind === 'transfer') {
      return this.#submitTransfer(draft, total, pricing);
    }
    if (operationKind === 'adjustment') {
      return this.#submitAdjustment(draft, total);
    }

    throw new ObjectDomainError('invalid-input', 'Unsupported operation kind.');
  }

  #submitSale(draft: QuickEntryDraft, total: number, quantity?: number, pricing?: TransactionPricing): TransactionRecord {
    if (draft.paymentMode === 'full') {
      if (!draft.accountId) {
        throw new ObjectDomainError('invalid-input', 'Payment account is required for full payment.');
      }
      return this.transactions.createTransaction({
        itemId: draft.itemId,
        movements: [{ accountId: draft.accountId, amount: total, movementType: 'inflow' }],
        note: draft.note,
        paidAmount: total,
        personId: draft.personId,
        pricing,
        quantity,
        totalAmount: total,
        transactionType: 'sale',
      });
    }

    if (draft.paymentMode === 'partial') {
      const paid = Number(draft.paidAmount ?? 0);
      if (!Number.isFinite(paid) || paid <= 0 || paid >= total) {
        throw new ObjectDomainError(
          'invalid-input',
          'Paid amount in partial mode must be greater than zero and less than total amount.',
        );
      }
      if (!draft.accountId) {
        throw new ObjectDomainError('invalid-input', 'Payment account is required for partial payment.');
      }
      return this.transactions.createTransaction({
        itemId: draft.itemId,
        movements: [{ accountId: draft.accountId, amount: paid, movementType: 'inflow' }],
        note: draft.note ? `${draft.note} (Partial)` : undefined,
        paidAmount: paid,
        personId: draft.personId,
        pricing,
        quantity,
        totalAmount: total,
        transactionType: 'sale',
      });
    }

    if (draft.paymentMode === 'later') {
      return this.transactions.createTransaction({
        itemId: draft.itemId,
        movements: [],
        note: draft.note ? `${draft.note} (Unpaid / Later)` : 'Unpaid (Later)',
        paidAmount: 0,
        personId: draft.personId,
        pricing,
        quantity,
        totalAmount: total,
        transactionType: 'sale',
      });
    }

    throw new ObjectDomainError('invalid-input', 'Invalid payment mode.');
  }

  #submitPurchase(draft: QuickEntryDraft, total: number, quantity?: number, pricing?: TransactionPricing): TransactionRecord {
    if (!draft.accountId) {
      throw new ObjectDomainError('invalid-input', 'Payment account is required for purchase.');
    }
    return this.transactions.createTransaction({
      itemId: draft.itemId,
      movements: [{ accountId: draft.accountId, amount: total, movementType: 'outflow' }],
      note: draft.note,
      paidAmount: total,
      personId: draft.personId,
      pricing,
      quantity,
      totalAmount: total,
      transactionType: 'purchase',
    });
  }

  #submitExpense(draft: QuickEntryDraft, total: number, pricing?: TransactionPricing): TransactionRecord {
    if (!draft.accountId) {
      throw new ObjectDomainError('invalid-input', 'Payment account is required for expense.');
    }
    return this.transactions.createTransaction({
      movements: [{ accountId: draft.accountId, amount: total, movementType: 'outflow' }],
      note: draft.note,
      paidAmount: total,
      personId: draft.personId,
      pricing,
      totalAmount: total,
      transactionType: 'expense',
    });
  }

  #submitIncome(draft: QuickEntryDraft, total: number, pricing?: TransactionPricing): TransactionRecord {
    if (!draft.accountId) {
      throw new ObjectDomainError('invalid-input', 'Receiving account is required for income.');
    }
    return this.transactions.createTransaction({
      movements: [{ accountId: draft.accountId, amount: total, movementType: 'inflow' }],
      note: draft.note,
      paidAmount: total,
      personId: draft.personId,
      pricing,
      totalAmount: total,
      transactionType: 'income',
    });
  }

  #submitTransfer(draft: QuickEntryDraft, total: number, pricing?: TransactionPricing): TransactionRecord {
    if (!draft.accountId || !draft.toAccountId) {
      throw new ObjectDomainError('invalid-input', 'Both source and destination accounts are required for transfer.');
    }
    return this.transactions.createTransfer({
      amount: total,
      fromAccountId: draft.accountId,
      note: draft.note,
      pricing,
      providerFee: draft.providerFee,
      serviceFee: draft.serviceFee,
      toAccountId: draft.toAccountId,
    });
  }

  #submitAdjustment(draft: QuickEntryDraft, total: number): TransactionRecord {
    if (!draft.accountId) {
      throw new ObjectDomainError('invalid-input', 'Account is required for an adjustment.');
    }
    return this.transactions.createTransaction({
      movements: [{
        accountId: draft.accountId,
        amount: total,
        movementType: draft.adjustmentDirection === 'outflow' ? 'outflow' : 'inflow',
      }],
      note: draft.note,
      paidAmount: total,
      totalAmount: total,
      transactionType: 'adjustment',
    });
  }

  #calculatePricing(draft: QuickEntryDraft, amount: number): TransactionPricing | undefined {
    const service = draft.pricingServiceId ? this.pricingCatalog.getService(draft.pricingServiceId) : undefined;
    if (service && service.operation !== draft.operationKind) {
      throw new ObjectDomainError('invalid-input', 'The selected service does not support this operation.');
    }
    const profileId = draft.pricingProfileId ?? service?.pricingProfileId;
    if (!profileId) return undefined;
    const inputMode = draft.pricingInputMode ?? service?.defaultInputMode;
    if (service && inputMode && !service.inputModes.includes(inputMode)) {
      throw new ObjectDomainError('invalid-input', 'The selected service does not support this input mode.');
    }
    const source = draft.accountId ? this.accounts.getAccount(draft.accountId) : undefined;
    const destination = draft.toAccountId ? this.accounts.getAccount(draft.toAccountId) : undefined;
    if (service && source && !service.paymentAccountTypes.includes(source.accountType)) {
      throw new ObjectDomainError('invalid-input', 'The selected account type is not allowed for this service.');
    }
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const countRow = service
      ? this.database.prepare(`SELECT COUNT(*) AS count FROM shop_transactions WHERE pricing_service_id = ? AND created_at >= ? AND archived_at IS NULL AND reversed_at IS NULL`).get(service.id, monthStart) as { count: number }
      : this.database.prepare(`SELECT COUNT(*) AS count FROM shop_transactions WHERE pricing_profile_id = ? AND created_at >= ? AND archived_at IS NULL AND reversed_at IS NULL`).get(profileId, monthStart) as { count: number };
    const providers = this.pricingCatalog.listProviders();
    const channels = this.pricingCatalog.listChannels();
    const sourceProviderId = source?.providerId ?? service?.providerId;
    const destinationProviderId = destination?.providerId;
    const providerName = (id?: string) => providers.find((provider) => provider.id === id)?.name;
    const snapshot = this.pricing.quote(profileId, {
      amount,
      context: {
        channel: channels.find((channel) => channel.id === service?.channelId)?.name,
        customerType: draft.pricingCustomerType,
        date: now.toISOString().slice(0, 10),
        destinationAccountType: destination?.accountType,
        destinationProvider: providerName(destinationProviderId),
        operation: draft.operationKind,
        sameProvider: sourceProviderId !== undefined && destinationProviderId !== undefined ? sourceProviderId === destinationProviderId : undefined,
        service: service?.name,
        sourceAccountType: source?.accountType,
        sourceProvider: providerName(sourceProviderId),
        transactionCount: countRow.count + 1,
      },
      inputMode,
      overrides: draft.pricingOverrides,
      providerCost: draft.providerCost,
    });
    return {
      ...snapshot.totals,
      overrides: draft.pricingOverrides ?? [],
      profileId,
      serviceId: service?.id,
      snapshot,
    };
  }
}
