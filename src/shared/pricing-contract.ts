export const pricingComponentTypes = [
  'provider_fee',
  'customer_fee',
  'profit',
  'commission',
  'tax',
  'discount',
  'cashback',
  'conversion',
] as const;
export type PricingComponentType = (typeof pricingComponentTypes)[number];

export const pricingCalculationTypes = [
  'fixed',
  'percentage',
  'percentage_min_max',
  'fixed_plus_percentage',
  'tiered',
  'lookup',
  'conversion',
] as const;
export type PricingCalculationType = (typeof pricingCalculationTypes)[number];

export const calculationBases = [
  'principal',
  'delivered_value',
  'provider_cost',
  'subtotal',
  'previous_component',
  'custom_components',
] as const;
export type CalculationBase = (typeof calculationBases)[number];

export type RoundingRule = Readonly<{
  increment?: number;
  mode: 'down' | 'nearest' | 'up';
  precision: 0 | 2;
}>;

export type SimplePricingCalculation = Readonly<{
  fixedAmount?: number;
  kind: 'fixed' | 'fixed_plus_percentage' | 'percentage' | 'percentage_min_max';
  maximum?: number;
  minimum?: number;
  rate?: number;
}>;

export type PricingTier = Readonly<{
  calculation: SimplePricingCalculation;
  from: number;
  to?: number;
}>;

export type PricingLookupEntry = Readonly<{
  customerPays: number;
  deliveredValue: number;
  label?: string;
  providerCost?: number;
}>;

export type PricingCalculation =
  | SimplePricingCalculation
  | Readonly<{ kind: 'tiered'; mode: 'banded'; tiers: readonly PricingTier[] }>
  | Readonly<{ entries: readonly PricingLookupEntry[]; kind: 'lookup' }>
  | Readonly<{ kind: 'conversion'; rate: number }>;

export type PricingCondition = Readonly<{
  field: PricingConditionField;
  operator: PricingConditionOperator;
  value: boolean | number | string;
  valueTo?: number | string;
}>;

export const pricingConditionFields = [
  'amount', 'service', 'operation', 'source_account_type', 'source_provider', 'destination_account_type',
  'destination_provider', 'same_provider', 'channel', 'customer_type', 'date', 'transaction_count',
] as const;
export type PricingConditionField = (typeof pricingConditionFields)[number];
export const pricingConditionOperators = ['eq', 'neq', 'gte', 'lte', 'between'] as const;
export type PricingConditionOperator = (typeof pricingConditionOperators)[number];

export type PricingComponent = Readonly<{
  base: CalculationBase;
  baseComponentIds?: readonly string[];
  calculation: PricingCalculation;
  chargedTo: 'customer' | 'provider' | 'shop';
  conditions: readonly PricingCondition[];
  effectiveFrom?: string;
  effectiveUntil?: string;
  id: string;
  label: string;
  order: number;
  paidTo?: 'customer' | 'provider' | 'shop';
  priority: number;
  rounding: RoundingRule;
  taxMode?: 'exclusive' | 'inclusive';
  type: PricingComponentType;
}>;

export type PricingProfileDraft = Readonly<{
  active: boolean;
  channel?: string;
  components: readonly PricingComponent[];
  currency: 'EGP';
  inputMode: 'customer_pays' | 'customer_receives';
  name: string;
  provider?: string;
  service?: string;
}>;

export type PricingProfile = PricingProfileDraft & Readonly<{
  createdAt: string;
  id: string;
  updatedAt: string;
}>;

export type PricingContext = Readonly<{
  channel?: string;
  customerType?: string;
  date?: string;
  destinationAccountType?: string;
  destinationProvider?: string;
  operation?: string;
  sameProvider?: boolean;
  service?: string;
  sourceAccountType?: string;
  sourceProvider?: string;
  transactionCount?: number;
}>;

export type PricingOverride = Readonly<{
  actor: string;
  amount: number;
  componentId: string;
  reason: string;
}>;

export type PricingQuoteInput = Readonly<{
  amount: number;
  context?: PricingContext;
  inputMode?: 'customer_pays' | 'customer_receives';
  overrides?: readonly PricingOverride[];
  providerCost?: number;
}>;

export type PricingComponentResult = Readonly<{
  actualAmount: number;
  baseAmount: number;
  calculatedAmount: number;
  componentId: string;
  label: string;
  override?: PricingOverride;
  type: PricingComponentType;
}>;

export type PricingAmounts = Readonly<{
  cashback: number;
  customerFee: number;
  customerTotal: number;
  deliveredValue: number;
  discount: number;
  netProfit: number;
  principalAmount: number;
  profitMarkup: number;
  providerCommission: number;
  providerCost: number;
  providerFee: number;
  shopNetCost: number;
  taxAmount: number;
}>;

export type PricingSnapshot = Readonly<{
  calculatedAt: string;
  componentResults: readonly PricingComponentResult[];
  input: PricingQuoteInput;
  profile: PricingProfile;
  totals: PricingAmounts;
}>;

export type PricingProviderDraft = Readonly<{
  active: boolean;
  name: string;
}>;

export type PricingProvider = PricingProviderDraft & Readonly<{
  createdAt: string;
  id: string;
  updatedAt: string;
}>;

export type PricingChannelDraft = Readonly<{
  active: boolean;
  name: string;
  providerId?: string;
}>;

export type PricingChannel = PricingChannelDraft & Readonly<{
  createdAt: string;
  id: string;
  updatedAt: string;
}>;

export const pricingServiceOperations = ['sale', 'purchase', 'expense', 'income', 'transfer'] as const;
export type PricingServiceOperation = (typeof pricingServiceOperations)[number];

export type PricingServiceDraft = Readonly<{
  active: boolean;
  category: string;
  channelId?: string;
  defaultInputMode: 'customer_pays' | 'customer_receives';
  inputLabel: string;
  inputModes: readonly ('customer_pays' | 'customer_receives')[];
  name: string;
  operation: PricingServiceOperation;
  paymentAccountTypes: readonly ('bank' | 'cash' | 'other' | 'wallet')[];
  pricingProfileId: string;
  providerId?: string;
}>;

export type PricingService = PricingServiceDraft & Readonly<{
  createdAt: string;
  id: string;
  updatedAt: string;
}>;

const DEFAULT_ROUNDING: RoundingRule = { mode: 'nearest', precision: 2 };

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundPricingAmount(value: number, rule: RoundingRule = DEFAULT_ROUNDING): number {
  const precisionIncrement = rule.precision === 0 ? 1 : 0.01;
  const increment = rule.increment && rule.increment > 0 ? rule.increment : precisionIncrement;
  const scaled = value / increment;
  const rounded = rule.mode === 'up'
    ? Math.ceil(scaled - Number.EPSILON)
    : rule.mode === 'down'
      ? Math.floor(scaled + Number.EPSILON)
      : Math.round(scaled);
  const precisionFactor = rule.precision === 0 ? 1 : 100;
  return Math.round(rounded * increment * precisionFactor) / precisionFactor;
}

function simpleAmount(calculation: SimplePricingCalculation, base: number): number {
  const fixed = Number(calculation.fixedAmount ?? 0);
  const percentage = base * Number(calculation.rate ?? 0) / 100;
  let amount = calculation.kind === 'fixed' ? fixed
    : calculation.kind === 'percentage' || calculation.kind === 'percentage_min_max' ? percentage
      : fixed + percentage;
  if (calculation.minimum !== undefined) amount = Math.max(amount, calculation.minimum);
  if (calculation.maximum !== undefined) amount = Math.min(amount, calculation.maximum);
  return amount;
}

function calculationAmount(calculation: PricingCalculation, base: number): number {
  if (calculation.kind === 'tiered') {
    const tier = calculation.tiers.find(({ from, to }) => base >= from && (to === undefined || base <= to));
    if (!tier) return 0;
    return simpleAmount(tier.calculation, base);
  }
  if (calculation.kind === 'lookup' || calculation.kind === 'conversion') return 0;
  return simpleAmount(calculation, base);
}

function compareCondition(actual: boolean | number | string | undefined, condition: PricingCondition): boolean {
  if (actual === undefined) return false;
  if (condition.operator === 'eq') return actual === condition.value;
  if (condition.operator === 'neq') return actual !== condition.value;
  if (condition.operator === 'gte') return actual >= condition.value;
  if (condition.operator === 'lte') return actual <= condition.value;
  return actual >= condition.value && condition.valueTo !== undefined && actual <= condition.valueTo;
}

function conditionValue(condition: PricingCondition, amount: number, context: PricingContext): boolean | number | string | undefined {
  if (condition.field === 'amount') return amount;
  if (condition.field === 'channel') return context.channel;
  if (condition.field === 'customer_type') return context.customerType;
  if (condition.field === 'date') return context.date;
  if (condition.field === 'destination_account_type') return context.destinationAccountType;
  if (condition.field === 'destination_provider') return context.destinationProvider;
  if (condition.field === 'operation') return context.operation;
  if (condition.field === 'same_provider') return context.sameProvider;
  if (condition.field === 'service') return context.service;
  if (condition.field === 'source_account_type') return context.sourceAccountType;
  if (condition.field === 'source_provider') return context.sourceProvider;
  return context.transactionCount;
}

function componentApplies(component: PricingComponent, amount: number, context: PricingContext, at: string): boolean {
  const from = component.effectiveFrom?.length === 10 ? `${component.effectiveFrom}T00:00:00.000Z` : component.effectiveFrom;
  const until = component.effectiveUntil?.length === 10 ? `${component.effectiveUntil}T23:59:59.999Z` : component.effectiveUntil;
  if (from && at < from) return false;
  if (until && at > until) return false;
  return component.conditions.every((condition) => compareCondition(conditionValue(condition, amount, context), condition));
}

function matchingLookup(entries: readonly PricingLookupEntry[], amount: number, mode: 'customer_pays' | 'customer_receives') {
  return entries.find((entry) => Math.abs((mode === 'customer_pays' ? entry.customerPays : entry.deliveredValue) - amount) < 0.005);
}

export function calculatePricing(profile: PricingProfile, input: PricingQuoteInput, calculatedAt = new Date().toISOString()): PricingSnapshot {
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error('Pricing amount must be a non-negative finite number.');
  for (const override of input.overrides ?? []) {
    if (!Number.isFinite(override.amount) || override.amount < 0) throw new Error('Override amount must be non-negative.');
    if (!override.reason.trim()) throw new Error('Every pricing override requires a reason.');
    if (!profile.components.some(({ id }) => id === override.componentId)) throw new Error('Pricing override component was not found.');
  }
  const mode = input.inputMode ?? profile.inputMode;
  const context: PricingContext = {
    channel: profile.channel,
    service: profile.service,
    sourceProvider: profile.provider,
    ...input.context,
  };
  const ordered = [...profile.components].sort((a, b) => a.order - b.order || b.priority - a.priority || a.id.localeCompare(b.id));
  const conversion = ordered.find((component) => component.type === 'conversion' && componentApplies(component, input.amount, context, calculatedAt));

  let principal = input.amount;
  let delivered = input.amount;
  let lookupCost: number | undefined;
  if (conversion?.calculation.kind === 'conversion') {
    if (conversion.calculation.rate <= 0) throw new Error('Conversion rate must be greater than zero.');
    if (mode === 'customer_pays') delivered = roundPricingAmount(input.amount * conversion.calculation.rate, conversion.rounding);
    else principal = roundPricingAmount(input.amount / conversion.calculation.rate, conversion.rounding);
  } else if (conversion?.calculation.kind === 'lookup') {
    const entry = matchingLookup(conversion.calculation.entries, input.amount, mode);
    if (!entry) throw new Error('No lookup-table price matches the requested amount.');
    principal = entry.customerPays;
    delivered = entry.deliveredValue;
    lookupCost = entry.providerCost;
  }

  let customerTotal = principal;
  let shopNetCost = input.providerCost ?? lookupCost ?? principal;
  const providerCost = shopNetCost;
  let previousAmount = 0;
  let providerFee = 0;
  let customerFee = 0;
  let taxAmount = 0;
  let profitMarkup = 0;
  let providerCommission = 0;
  let discount = 0;
  let cashback = 0;
  const results: PricingComponentResult[] = [];

  for (const component of ordered) {
    if (component.type === 'conversion' || !componentApplies(component, principal, context, calculatedAt)) continue;
    const base = component.base === 'principal' ? principal
      : component.base === 'delivered_value' ? delivered
        : component.base === 'provider_cost' ? providerCost
          : component.base === 'previous_component' ? previousAmount
            : component.base === 'custom_components'
              ? results
                .filter(({ componentId }) => component.baseComponentIds?.includes(componentId))
                .reduce((sum, result) => sum + result.actualAmount, 0)
              : customerTotal;
    let calculated = calculationAmount(component.calculation, base);
    if (component.type === 'tax' && component.taxMode === 'inclusive' && 'rate' in component.calculation) {
      const rate = Number(component.calculation.rate ?? 0) / 100;
      calculated = rate > 0 ? base - base / (1 + rate) : 0;
    }
    calculated = roundPricingAmount(calculated, component.rounding);
    const override = input.overrides?.find(({ componentId }) => componentId === component.id);
    const actual = override ? roundPricingAmount(override.amount, component.rounding) : calculated;
    previousAmount = actual;

    if (component.type === 'provider_fee') providerFee += actual;
    else if (component.type === 'customer_fee') customerFee += actual;
    else if (component.type === 'tax') taxAmount += actual;
    else if (component.type === 'profit') profitMarkup += actual;
    else if (component.type === 'commission') providerCommission += actual;
    else if (component.type === 'discount') discount += actual;
    else if (component.type === 'cashback') cashback += actual;

    if (component.type === 'commission') {
      if (component.paidTo === 'shop') shopNetCost -= actual;
      else if (component.paidTo === 'customer') customerTotal -= actual;
    } else if (component.type === 'discount') {
      customerTotal -= actual;
      if (component.chargedTo === 'provider') shopNetCost -= actual;
    } else if (component.type === 'cashback') {
      if (component.paidTo === 'customer' && component.chargedTo === 'shop') shopNetCost += actual;
    } else if (!(component.type === 'tax' && component.taxMode === 'inclusive')) {
      if (component.chargedTo === 'customer') customerTotal += actual;
      else if (component.chargedTo === 'shop') shopNetCost += actual;
    }

    results.push({
      actualAmount: money(actual),
      baseAmount: money(base),
      calculatedAmount: money(calculated),
      componentId: component.id,
      label: component.label,
      override,
      type: component.type,
    });
  }

  const totals: PricingAmounts = {
    cashback: money(cashback),
    customerFee: money(customerFee),
    customerTotal: money(customerTotal),
    deliveredValue: money(delivered),
    discount: money(discount),
    netProfit: money(customerTotal - shopNetCost),
    principalAmount: money(principal),
    profitMarkup: money(profitMarkup),
    providerCommission: money(providerCommission),
    providerCost: money(providerCost),
    providerFee: money(providerFee),
    shopNetCost: money(shopNetCost),
    taxAmount: money(taxAmount),
  };

  return { calculatedAt, componentResults: results, input, profile, totals };
}
