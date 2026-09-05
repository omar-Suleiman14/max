import { Select } from '../ui/select';
import { Calculator, Plus, ReceiptText, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  calculationBases,
  pricingCalculationTypes,
  pricingConditionFields,
  pricingConditionOperators,
  pricingComponentTypes,
  pricingServiceOperations,
  type PricingCalculation,
  type PricingCalculationType,
  type PricingComponent,
  type PricingCondition,
  type PricingComponentType,
  type PricingProfile,
  type PricingProfileDraft,
  type PricingProvider,
  type PricingChannel,
  type PricingService,
  type PricingServiceDraft,
  type PricingSnapshot,
  type SimplePricingCalculation,
} from '../../shared/pricing-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';

const emptyDraft = (): PricingProfileDraft => ({
  active: true,
  components: [],
  currency: 'EGP',
  inputMode: 'customer_pays',
  name: '',
});

function defaultCalculation(kind: PricingCalculationType): PricingCalculation {
  if (kind === 'conversion') return { kind, rate: 0.7 };
  if (kind === 'lookup') return { entries: [{ customerPays: 100, deliveredValue: 70, providerCost: 98 }], kind };
  if (kind === 'tiered') return { kind, mode: 'banded', tiers: [{ calculation: { fixedAmount: 0, kind: 'fixed' }, from: 0 }] };
  if (kind === 'fixed') return { fixedAmount: 0, kind };
  if (kind === 'fixed_plus_percentage') return { fixedAmount: 0, kind, rate: 0 };
  if (kind === 'percentage_min_max') return { kind, rate: 0 };
  return { kind, rate: 0 };
}

function newComponent(type: PricingComponentType = 'profit', order = 10): PricingComponent {
  const isConversion = type === 'conversion';
  return {
    base: 'principal',
    calculation: defaultCalculation(isConversion ? 'conversion' : 'fixed'),
    chargedTo: 'customer',
    conditions: [],
    id: crypto.randomUUID(),
    label: isConversion ? 'Delivered value' : 'Profit',
    order,
    paidTo: type === 'commission' ? 'shop' : type === 'cashback' ? 'customer' : undefined,
    priority: 0,
    rounding: { mode: 'nearest', precision: 2 },
    taxMode: type === 'tax' ? 'exclusive' : undefined,
    type,
  };
}

function egyptianPresets(): readonly PricingProfileDraft[] {
  const fixed = (id: string, label: string, type: PricingComponentType, amount: number, order: number, extra: Partial<PricingComponent> = {}): PricingComponent => ({
    ...newComponent(type, order), calculation: { fixedAmount: amount, kind: 'fixed' }, id, label, ...extra,
  });
  return [
    {
      active: true,
      channel: 'InstaPay',
      components: [{ ...newComponent('provider_fee'), calculation: { kind: 'percentage_min_max', maximum: 20, minimum: 0.5, rate: 0.1 }, id: 'instapay-fee', label: 'InstaPay fee' }],
      currency: 'EGP', inputMode: 'customer_pays', name: 'InstaPay transfer', provider: 'InstaPay', service: 'Wallet transfer',
    },
    {
      active: true,
      components: [
        { ...newComponent('conversion'), calculation: { entries: [
          { customerPays: 10, deliveredValue: 7, providerCost: 10 },
          { customerPays: 25, deliveredValue: 17.5, providerCost: 25 },
          { customerPays: 50, deliveredValue: 35, providerCost: 50 },
          { customerPays: 100, deliveredValue: 70, providerCost: 100 },
        ], kind: 'lookup' }, id: 'recharge-values', label: 'Recharge value table' },
        fixed('recharge-commission', 'Provider commission', 'commission', 2, 20, { chargedTo: 'provider', paidTo: 'shop' }),
      ],
      currency: 'EGP', inputMode: 'customer_pays', name: 'Mobile recharge — editable example', service: 'Mobile recharge',
    },
    {
      active: true,
      channel: 'Fawry',
      components: [
        fixed('bill-provider-fee', 'Provider fee', 'provider_fee', 5, 10),
        fixed('bill-profit', 'Our profit', 'profit', 3, 20),
        fixed('bill-commission', 'Provider commission', 'commission', 2, 30, { chargedTo: 'provider', paidTo: 'shop' }),
      ],
      currency: 'EGP', inputMode: 'customer_pays', name: 'Utility bill — editable example', provider: 'Fawry', service: 'Utility bill',
    },
  ];
}

function copy(locale: Locale, en: string, ar: string) {
  return locale === 'ar' ? ar : en;
}

function numberValue(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function conditionValue(field: PricingCondition['field'], value: string): PricingCondition['value'] {
  if (field === 'amount' || field === 'transaction_count') return numberValue(value);
  if (field === 'same_provider') return value === 'true';
  return value;
}

const emptyServiceDraft = (profileId = ''): PricingServiceDraft => ({
  active: true,
  category: 'Service',
  defaultInputMode: 'customer_pays',
  inputLabel: 'Amount',
  inputModes: ['customer_pays'],
  name: '',
  operation: 'sale',
  paymentAccountTypes: ['cash', 'bank', 'wallet', 'other'],
  pricingProfileId: profileId,
});

function ServiceCatalogSettings({ locale, onError, profiles }: Readonly<{ locale: Locale; onError: (message?: string) => void; profiles: readonly PricingProfile[] }>) {
  const [providers, setProviders] = useState<readonly PricingProvider[]>([]);
  const [channels, setChannels] = useState<readonly PricingChannel[]>([]);
  const [services, setServices] = useState<readonly PricingService[]>([]);
  const [providerName, setProviderName] = useState('');
  const [providerEditId, setProviderEditId] = useState<string>();
  const [channelName, setChannelName] = useState('');
  const [channelProviderId, setChannelProviderId] = useState('');
  const [channelEditId, setChannelEditId] = useState<string>();
  const [serviceDraft, setServiceDraft] = useState<PricingServiceDraft>();
  const [serviceEditId, setServiceEditId] = useState<string>();

  async function loadCatalog() {
    const [providerList, channelList, serviceList] = await Promise.all([
      window.maxApi.pricing.providers.list(), window.maxApi.pricing.channels.list(), window.maxApi.pricing.services.list(),
    ]);
    setProviders(providerList);
    setChannels(channelList);
    setServices(serviceList);
  }

  useEffect(() => { void loadCatalog(); }, [profiles]);

  async function saveProvider() {
    const result = providerEditId
      ? await window.maxApi.pricing.providers.update(providerEditId, { active: true, name: providerName })
      : await window.maxApi.pricing.providers.create({ active: true, name: providerName });
    if (!result.ok) return onError(result.error.message);
    setProviderName(''); setProviderEditId(undefined); onError(undefined); await loadCatalog();
  }

  async function saveChannel() {
    const channel = { active: true, name: channelName, providerId: channelProviderId || undefined };
    const result = channelEditId
      ? await window.maxApi.pricing.channels.update(channelEditId, channel)
      : await window.maxApi.pricing.channels.create(channel);
    if (!result.ok) return onError(result.error.message);
    setChannelName(''); setChannelProviderId(''); setChannelEditId(undefined); onError(undefined); await loadCatalog();
  }

  async function saveService() {
    if (!serviceDraft) return;
    const result = serviceEditId
      ? await window.maxApi.pricing.services.update(serviceEditId, serviceDraft)
      : await window.maxApi.pricing.services.create(serviceDraft);
    if (!result.ok) return onError(result.error.message);
    setServiceDraft(undefined); setServiceEditId(undefined); onError(undefined); await loadCatalog();
  }

  async function archive(kind: 'channel' | 'provider' | 'service', id: string) {
    const result = kind === 'provider' ? await window.maxApi.pricing.providers.archive(id)
      : kind === 'channel' ? await window.maxApi.pricing.channels.archive(id)
        : await window.maxApi.pricing.services.archive(id);
    if (!result.ok) onError(result.error.message); else await loadCatalog();
  }

  return <details className="pricing-catalog" open={services.length === 0 && profiles.length > 0}>
    <summary>{copy(locale, 'Providers, channels & service templates', 'المزودون والقنوات وقوالب الخدمات')}</summary>
    <div className="pricing-catalog-grid">
      <section>
        <strong>{copy(locale, 'Providers', 'المزودون')}</strong>
        <div className="pricing-catalog-form"><input onChange={(event) => setProviderName(event.target.value)} placeholder="Vodafone / Fawry / WE" value={providerName} /><Button disabled={!providerName.trim()} onClick={() => void saveProvider()}>{providerEditId ? copy(locale, 'Save', 'حفظ') : copy(locale, 'Add', 'إضافة')}</Button></div>
        {providers.map((provider) => <div className="pricing-catalog-row" key={provider.id}><span>{provider.name}</span><Button onClick={() => { setProviderEditId(provider.id); setProviderName(provider.name); }}>{copy(locale, 'Edit', 'تعديل')}</Button><button aria-label={copy(locale, 'Archive provider', 'أرشفة المزود')} className="icon-button" onClick={() => void archive('provider', provider.id)} type="button"><Trash2 size={13} /></button></div>)}
      </section>
      <section>
        <strong>{copy(locale, 'Channels', 'القنوات')}</strong>
        <div className="pricing-catalog-form"><input onChange={(event) => setChannelName(event.target.value)} placeholder="Aman / Fawry / Wallet" value={channelName} /><Select onChange={(event) => setChannelProviderId(event.target.value)} value={channelProviderId}><option value="">{copy(locale, 'Any provider', 'أي مزود')}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</Select><Button disabled={!channelName.trim()} onClick={() => void saveChannel()}>{channelEditId ? copy(locale, 'Save', 'حفظ') : copy(locale, 'Add', 'إضافة')}</Button></div>
        {channels.map((channel) => <div className="pricing-catalog-row" key={channel.id}><span>{channel.name}<small>{providers.find(({ id }) => id === channel.providerId)?.name}</small></span><Button onClick={() => { setChannelEditId(channel.id); setChannelName(channel.name); setChannelProviderId(channel.providerId ?? ''); }}>{copy(locale, 'Edit', 'تعديل')}</Button><button aria-label={copy(locale, 'Archive channel', 'أرشفة القناة')} className="icon-button" onClick={() => void archive('channel', channel.id)} type="button"><Trash2 size={13} /></button></div>)}
      </section>
    </div>
    <section className="pricing-services-section">
      <div className="pricing-components-head"><div><strong>{copy(locale, 'Service templates', 'قوالب الخدمات')}</strong><small>{copy(locale, 'A selected service automatically chooses its pricing and allowed input.', 'اختيار الخدمة يحدد التسعير وطريقة الإدخال تلقائيًا.')}</small></div><Button disabled={profiles.length === 0} onClick={() => { setServiceEditId(undefined); setServiceDraft(emptyServiceDraft(profiles[0]?.id)); }}>{copy(locale, 'New service', 'خدمة جديدة')}</Button></div>
      {services.map((service) => <div className="pricing-profile-row" key={service.id}><div><strong>{service.name}</strong><span>{service.category} · {service.operation.replaceAll('_', ' ')}</span></div><div className="pricing-profile-meta"><span>{profiles.find(({ id }) => id === service.pricingProfileId)?.name}</span><span>{providers.find(({ id }) => id === service.providerId)?.name}</span></div><div className="settings-row-actions"><Button onClick={() => { setServiceEditId(service.id); setServiceDraft({ ...service }); }}>{copy(locale, 'Edit', 'تعديل')}</Button><Button onClick={() => void archive('service', service.id)}>{copy(locale, 'Archive', 'أرشفة')}</Button></div></div>)}
      {serviceDraft && <div className="pricing-service-editor">
        <label className="field"><span>{copy(locale, 'Name', 'الاسم')}</span><input onChange={(event) => setServiceDraft({ ...serviceDraft, name: event.target.value })} value={serviceDraft.name} /></label>
        <label className="field"><span>{copy(locale, 'Category', 'الفئة')}</span><input onChange={(event) => setServiceDraft({ ...serviceDraft, category: event.target.value })} value={serviceDraft.category} /></label>
        <label className="field"><span>{copy(locale, 'Operation', 'العملية')}</span><Select onChange={(event) => setServiceDraft({ ...serviceDraft, operation: event.target.value as PricingServiceDraft['operation'] })} value={serviceDraft.operation}>{pricingServiceOperations.map((operation) => <option key={operation} value={operation}>{operation.replaceAll('_', ' ')}</option>)}</Select></label>
        <label className="field"><span>{copy(locale, 'Pricing profile', 'ملف التسعير')}</span><Select onChange={(event) => setServiceDraft({ ...serviceDraft, pricingProfileId: event.target.value })} value={serviceDraft.pricingProfileId}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</Select></label>
        <label className="field"><span>{copy(locale, 'Provider', 'المزود')}</span><Select onChange={(event) => setServiceDraft({ ...serviceDraft, providerId: event.target.value || undefined, channelId: undefined })} value={serviceDraft.providerId ?? ''}><option value="">{copy(locale, 'Any provider', 'أي مزود')}</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</Select></label>
        <label className="field"><span>{copy(locale, 'Channel', 'القناة')}</span><Select onChange={(event) => setServiceDraft({ ...serviceDraft, channelId: event.target.value || undefined })} value={serviceDraft.channelId ?? ''}><option value="">{copy(locale, 'Any channel', 'أي قناة')}</option>{channels.filter((channel) => !serviceDraft.providerId || !channel.providerId || channel.providerId === serviceDraft.providerId).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</Select></label>
        <label className="field"><span>{copy(locale, 'Input label', 'اسم حقل الإدخال')}</span><input onChange={(event) => setServiceDraft({ ...serviceDraft, inputLabel: event.target.value })} value={serviceDraft.inputLabel} /></label>
        <label className="field"><span>{copy(locale, 'Default input', 'الإدخال الافتراضي')}</span><Select onChange={(event) => { const mode = event.target.value as PricingServiceDraft['defaultInputMode']; setServiceDraft({ ...serviceDraft, defaultInputMode: mode, inputModes: serviceDraft.inputModes.includes(mode) ? serviceDraft.inputModes : [...serviceDraft.inputModes, mode] }); }} value={serviceDraft.defaultInputMode}><option value="customer_pays">customer pays</option><option value="customer_receives">customer receives</option></Select></label>
        <fieldset><legend>{copy(locale, 'Allowed inputs', 'طرق الإدخال المتاحة')}</legend>{(['customer_pays', 'customer_receives'] as const).map((mode) => <label key={mode}><input checked={serviceDraft.inputModes.includes(mode)} disabled={serviceDraft.defaultInputMode === mode} onChange={(event) => setServiceDraft({ ...serviceDraft, inputModes: event.target.checked ? [...serviceDraft.inputModes, mode] : serviceDraft.inputModes.filter((candidate) => candidate !== mode) })} type="checkbox" />{mode.replaceAll('_', ' ')}</label>)}</fieldset>
        <fieldset><legend>{copy(locale, 'Payment accounts', 'حسابات الدفع')}</legend>{(['cash', 'wallet', 'bank', 'other'] as const).map((type) => <label key={type}><input checked={serviceDraft.paymentAccountTypes.includes(type)} onChange={(event) => setServiceDraft({ ...serviceDraft, paymentAccountTypes: event.target.checked ? [...serviceDraft.paymentAccountTypes, type] : serviceDraft.paymentAccountTypes.filter((candidate) => candidate !== type) })} type="checkbox" />{type}</label>)}</fieldset>
        <div className="settings-row-actions"><Button onClick={() => { setServiceDraft(undefined); setServiceEditId(undefined); }}>{copy(locale, 'Cancel', 'إلغاء')}</Button><Button disabled={!serviceDraft.name.trim() || !serviceDraft.pricingProfileId || serviceDraft.paymentAccountTypes.length === 0} onClick={() => void saveService()} variant="primary">{copy(locale, 'Save service', 'حفظ الخدمة')}</Button></div>
      </div>}
    </section>
  </details>;
}

export function PricingSettings({ locale }: Readonly<{ locale: Locale }>) {
  const [profiles, setProfiles] = useState<readonly PricingProfile[]>([]);
  const [draft, setDraft] = useState<PricingProfileDraft>();
  const [editingId, setEditingId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [previewProfileId, setPreviewProfileId] = useState('');
  const [previewAmount, setPreviewAmount] = useState('100');
  const [preview, setPreview] = useState<PricingSnapshot>();

  async function load() {
    const loaded = await window.maxApi.pricing.list();
    setProfiles(loaded);
    setPreviewProfileId((current) => current || loaded[0]?.id || '');
  }

  useEffect(() => { void load(); }, []);

  function patchDraft(patch: Partial<PricingProfileDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function patchComponent(index: number, patch: Partial<PricingComponent>) {
    setDraft((current) => current ? {
      ...current,
      components: current.components.map((component, candidate) => candidate === index ? { ...component, ...patch } : component),
    } : current);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(undefined);
    const result = editingId
      ? await window.maxApi.pricing.update(editingId, draft)
      : await window.maxApi.pricing.create(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDraft(undefined);
    setEditingId(undefined);
    await load();
  }

  async function archive(profile: PricingProfile) {
    if (!window.confirm(copy(locale, `Archive “${profile.name}”? Historical snapshots will remain unchanged.`, `أرشفة «${profile.name}»؟ ستبقى لقطات المعاملات السابقة كما هي.`))) return;
    const result = await window.maxApi.pricing.archive(profile.id);
    if (!result.ok) setError(result.error.message);
    else await load();
  }

  async function calculatePreview() {
    if (!previewProfileId) return;
    const result = await window.maxApi.pricing.quote(previewProfileId, { amount: numberValue(previewAmount) });
    if (result.ok) {
      setPreview(result.value);
      setError(undefined);
    } else setError(result.error.message);
  }

  async function installPresets() {
    setError(undefined);
    const createdProfiles: PricingProfile[] = [];
    for (const preset of egyptianPresets()) {
      const result = await window.maxApi.pricing.create(preset);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      createdProfiles.push(result.value);
    }
    const instaPay = await window.maxApi.pricing.providers.create({ active: true, name: 'InstaPay' });
    const fawry = await window.maxApi.pricing.providers.create({ active: true, name: 'Fawry' });
    if (!instaPay.ok || !fawry.ok) { setError(!instaPay.ok ? instaPay.error.message : !fawry.ok ? fawry.error.message : ''); return; }
    const instaChannel = await window.maxApi.pricing.channels.create({ active: true, name: 'InstaPay', providerId: instaPay.value.id });
    const fawryChannel = await window.maxApi.pricing.channels.create({ active: true, name: 'Fawry', providerId: fawry.value.id });
    if (!instaChannel.ok || !fawryChannel.ok) { setError(!instaChannel.ok ? instaChannel.error.message : !fawryChannel.ok ? fawryChannel.error.message : ''); return; }
    const serviceDrafts: PricingServiceDraft[] = [
      { active: true, category: 'Wallet transfer', channelId: instaChannel.value.id, defaultInputMode: 'customer_pays', inputLabel: 'Transfer amount', inputModes: ['customer_pays'], name: 'InstaPay transfer', operation: 'transfer', paymentAccountTypes: ['bank', 'wallet'], pricingProfileId: createdProfiles[0]!.id, providerId: instaPay.value.id },
      { active: true, category: 'Recharge', defaultInputMode: 'customer_pays', inputLabel: 'Payment or desired credit', inputModes: ['customer_pays', 'customer_receives'], name: 'Mobile recharge', operation: 'sale', paymentAccountTypes: ['cash', 'bank', 'wallet', 'other'], pricingProfileId: createdProfiles[1]!.id },
      { active: true, category: 'Utility', channelId: fawryChannel.value.id, defaultInputMode: 'customer_pays', inputLabel: 'Bill amount', inputModes: ['customer_pays'], name: 'Utility bill', operation: 'sale', paymentAccountTypes: ['cash', 'bank', 'wallet', 'other'], pricingProfileId: createdProfiles[2]!.id, providerId: fawry.value.id },
    ];
    for (const service of serviceDrafts) {
      const result = await window.maxApi.pricing.services.create(service);
      if (!result.ok) { setError(result.error.message); return; }
    }
    await load();
  }

  return (
    <div className="pricing-settings">
      <div className="pricing-toolbar">
        <div>
          <strong>{copy(locale, 'Service pricing', 'تسعير الخدمات')}</strong>
          <small>{copy(locale, 'Reusable profiles for fees, profit, commissions, taxes, discounts, and delivered value.', 'ملفات قابلة لإعادة الاستخدام للرسوم والربح والعمولات والضرائب والخصومات والقيمة المستلمة.')}</small>
        </div>
        <Button icon={<Plus aria-hidden="true" size={15} />} onClick={() => { setEditingId(undefined); setDraft(emptyDraft()); }} variant="primary">
          {copy(locale, 'New pricing profile', 'ملف تسعير جديد')}
        </Button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <ServiceCatalogSettings locale={locale} onError={setError} profiles={profiles} />

      {profiles.length === 0 && !draft ? (
        <div className="pricing-empty">
          <ReceiptText aria-hidden="true" size={24} />
          <strong>{copy(locale, 'No pricing profiles yet', 'لا توجد ملفات تسعير بعد')}</strong>
          <span>{copy(locale, 'Create one for a recharge, bill, transfer, or any custom shop service.', 'أنشئ ملفًا للشحن أو الفواتير أو التحويل أو أي خدمة خاصة بالمحل.')}</span>
          <div className="settings-row-actions"><Button onClick={() => setDraft(emptyDraft())}>{copy(locale, 'Create pricing', 'إنشاء تسعير')}</Button><Button icon={<Sparkles aria-hidden="true" size={14} />} onClick={() => void installPresets()}>{copy(locale, 'Add editable Egyptian presets', 'إضافة إعدادات مصرية قابلة للتعديل')}</Button></div>
        </div>
      ) : (
        <div className="pricing-profile-list">
          {profiles.map((profile) => (
            <div className="pricing-profile-row" key={profile.id}>
              <div>
                <strong>{profile.name}</strong>
                <span>{[profile.provider, profile.channel, profile.service].filter(Boolean).join(' · ') || copy(locale, 'Custom service', 'خدمة مخصصة')}</span>
              </div>
              <div className="pricing-profile-meta">
                <span>{profile.components.length} {copy(locale, 'components', 'مكونات')}</span>
                <span>{profile.inputMode === 'customer_pays' ? copy(locale, 'Customer pays', 'العميل يدفع') : copy(locale, 'Customer receives', 'العميل يستلم')}</span>
              </div>
              <div className="settings-row-actions">
                <Button onClick={() => { setEditingId(profile.id); setDraft({ ...profile }); }}>{copy(locale, 'Edit', 'تعديل')}</Button>
                <Button icon={<Trash2 aria-hidden="true" size={14} />} onClick={() => void archive(profile)}>{copy(locale, 'Archive', 'أرشفة')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="pricing-preview">
          <div className="pricing-preview__controls">
            <label className="field"><span>{copy(locale, 'Profile', 'ملف التسعير')}</span><Select onChange={(event) => setPreviewProfileId(event.target.value)} value={previewProfileId}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</Select></label>
            <label className="field"><span>{copy(locale, 'Test amount', 'مبلغ التجربة')}</span><input min="0" onChange={(event) => setPreviewAmount(event.target.value)} step="0.01" type="number" value={previewAmount} /></label>
            <Button icon={<Calculator aria-hidden="true" size={15} />} onClick={() => void calculatePreview()}>{copy(locale, 'Calculate', 'احسب')}</Button>
          </div>
          {preview && (
            <div className="pricing-result-grid">
              <div><span>{copy(locale, 'Customer pays', 'العميل يدفع')}</span><strong>{preview.totals.customerTotal.toFixed(2)} EGP</strong></div>
              <div><span>{copy(locale, 'Customer receives', 'العميل يستلم')}</span><strong>{preview.totals.deliveredValue.toFixed(2)}</strong></div>
              <div><span>{copy(locale, 'Shop cost', 'تكلفة المحل')}</span><strong>{preview.totals.shopNetCost.toFixed(2)} EGP</strong></div>
              <div><span>{copy(locale, 'Net profit', 'صافي الربح')}</span><strong>{preview.totals.netProfit.toFixed(2)} EGP</strong></div>
            </div>
          )}
        </div>
      )}

      {draft && (
        <div className="pricing-editor">
          <div className="pricing-editor__header">
            <div><strong>{editingId ? copy(locale, 'Edit pricing profile', 'تعديل ملف التسعير') : copy(locale, 'New pricing profile', 'ملف تسعير جديد')}</strong><small>{copy(locale, 'Rules run in order and historical transactions keep a snapshot.', 'تُحسب القواعد بالترتيب وتحتفظ المعاملات السابقة بلقطة مستقلة.')}</small></div>
            <label className="pricing-active"><input checked={draft.active} onChange={(event) => patchDraft({ active: event.target.checked })} type="checkbox" />{copy(locale, 'Active', 'نشط')}</label>
          </div>

          <div className="pricing-profile-fields">
            <label className="field"><span>{copy(locale, 'Name', 'الاسم')}</span><input maxLength={120} onChange={(event) => patchDraft({ name: event.target.value })} value={draft.name} /></label>
            <label className="field"><span>{copy(locale, 'Provider', 'المزود')}</span><input onChange={(event) => patchDraft({ provider: event.target.value })} placeholder="Vodafone / Fawry / WE" value={draft.provider ?? ''} /></label>
            <label className="field"><span>{copy(locale, 'Channel', 'القناة')}</span><input onChange={(event) => patchDraft({ channel: event.target.value })} placeholder="Aman / Fawry / Wallet" value={draft.channel ?? ''} /></label>
            <label className="field"><span>{copy(locale, 'Service', 'الخدمة')}</span><input onChange={(event) => patchDraft({ service: event.target.value })} placeholder={copy(locale, 'Recharge / Electricity / Transfer', 'شحن / كهرباء / تحويل')} value={draft.service ?? ''} /></label>
            <label className="field"><span>{copy(locale, 'Input mode', 'طريقة الإدخال')}</span><Select onChange={(event) => patchDraft({ inputMode: event.target.value as PricingProfileDraft['inputMode'] })} value={draft.inputMode}><option value="customer_pays">{copy(locale, 'Customer pays', 'العميل يدفع')}</option><option value="customer_receives">{copy(locale, 'Customer receives', 'العميل يستلم')}</option></Select></label>
          </div>

          <div className="pricing-components-head">
            <div><strong>{copy(locale, 'Pricing components', 'مكونات التسعير')}</strong><small>{copy(locale, 'Provider fees, customer fees, profit, commission, tax, discount, cashback, or conversion.', 'رسوم المزود والعميل والربح والعمولة والضريبة والخصم والاسترداد أو التحويل.')}</small></div>
            <Button icon={<Plus aria-hidden="true" size={14} />} onClick={() => patchDraft({ components: [...draft.components, newComponent('profit', (draft.components.at(-1)?.order ?? 0) + 10)] })}>{copy(locale, 'Add component', 'إضافة مكوّن')}</Button>
          </div>

          <div className="pricing-component-list">
            {draft.components.map((component, index) => (
              <div className="pricing-component-card" key={component.id}>
                <div className="pricing-component-card__top">
                  <span className="pricing-order">{component.order}</span>
                  <input aria-label={copy(locale, `Component ${index + 1} label`, `اسم المكوّن ${index + 1}`)} onChange={(event) => patchComponent(index, { label: event.target.value })} value={component.label} />
                  <button aria-label={copy(locale, 'Remove component', 'حذف المكوّن')} className="icon-button" onClick={() => patchDraft({ components: draft.components.filter((_, candidate) => candidate !== index) })} type="button"><Trash2 aria-hidden="true" size={15} /></button>
                </div>
                <div className="pricing-component-fields">
                  <label className="field"><span>{copy(locale, 'Type', 'النوع')}</span><Select onChange={(event) => {
                    const type = event.target.value as PricingComponentType;
                    patchComponent(index, { calculation: defaultCalculation(type === 'conversion' ? 'conversion' : 'fixed'), paidTo: type === 'commission' ? 'shop' : type === 'cashback' ? 'customer' : undefined, taxMode: type === 'tax' ? 'exclusive' : undefined, type });
                  }} value={component.type}>{pricingComponentTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</Select></label>
                  <label className="field"><span>{copy(locale, 'Calculation', 'الحساب')}</span><Select onChange={(event) => patchComponent(index, { calculation: defaultCalculation(event.target.value as PricingCalculationType) })} value={component.calculation.kind}>{pricingCalculationTypes.filter((kind) => component.type === 'conversion' ? kind === 'conversion' || kind === 'lookup' : kind !== 'conversion' && kind !== 'lookup').map((kind) => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}</Select></label>
                  <label className="field"><span>{copy(locale, 'Base', 'أساس الحساب')}</span><Select onChange={(event) => { const base = event.target.value as PricingComponent['base']; patchComponent(index, { base, baseComponentIds: base === 'custom_components' ? component.baseComponentIds ?? [] : undefined }); }} value={component.base}>{calculationBases.filter((base) => base !== 'custom_components' || component.type === 'tax').map((base) => <option key={base} value={base}>{base.replaceAll('_', ' ')}</option>)}</Select></label>
                  <label className="field"><span>{copy(locale, 'Charged to', 'يتحملها')}</span><Select onChange={(event) => patchComponent(index, { chargedTo: event.target.value as PricingComponent['chargedTo'] })} value={component.chargedTo}><option value="customer">{copy(locale, 'Customer', 'العميل')}</option><option value="shop">{copy(locale, 'Shop', 'المحل')}</option><option value="provider">{copy(locale, 'Provider', 'المزود')}</option></Select></label>
                  <label className="field"><span>{copy(locale, 'Order', 'الترتيب')}</span><input onChange={(event) => patchComponent(index, { order: Math.round(numberValue(event.target.value)) })} step="1" type="number" value={component.order} /></label>
                  {(component.type === 'commission' || component.type === 'cashback') && <label className="field"><span>{copy(locale, 'Paid to', 'تُدفع إلى')}</span><Select onChange={(event) => patchComponent(index, { paidTo: event.target.value as PricingComponent['paidTo'] })} value={component.paidTo}><option value="shop">{copy(locale, 'Shop', 'المحل')}</option><option value="customer">{copy(locale, 'Customer', 'العميل')}</option><option value="provider">{copy(locale, 'Provider', 'المزود')}</option></Select></label>}
                  {component.type === 'tax' && <label className="field"><span>{copy(locale, 'Tax mode', 'وضع الضريبة')}</span><Select onChange={(event) => patchComponent(index, { taxMode: event.target.value as PricingComponent['taxMode'] })} value={component.taxMode}><option value="exclusive">{copy(locale, 'Added on top', 'تُضاف فوق السعر')}</option><option value="inclusive">{copy(locale, 'Already included', 'مشمولة في السعر')}</option></Select></label>}
                  <label className="field"><span>{copy(locale, 'Rounding', 'التقريب')}</span><Select onChange={(event) => patchComponent(index, { rounding: { ...component.rounding, mode: event.target.value as PricingComponent['rounding']['mode'] } })} value={component.rounding.mode}><option value="nearest">{copy(locale, 'Nearest', 'الأقرب')}</option><option value="up">{copy(locale, 'Up', 'لأعلى')}</option><option value="down">{copy(locale, 'Down', 'لأسفل')}</option></Select></label>
                </div>

                {component.base === 'custom_components' && <fieldset className="pricing-component-base-picker"><legend>{copy(locale, 'Tax applies to components', 'تُطبق الضريبة على المكونات')}</legend>{draft.components.filter((candidate) => candidate.id !== component.id).map((candidate) => <label key={candidate.id}><input checked={component.baseComponentIds?.includes(candidate.id) ?? false} onChange={(event) => patchComponent(index, { baseComponentIds: event.target.checked ? [...(component.baseComponentIds ?? []), candidate.id] : (component.baseComponentIds ?? []).filter((id) => id !== candidate.id) })} type="checkbox" />{candidate.label}</label>)}</fieldset>}

                <CalculationFields calculation={component.calculation} locale={locale} onChange={(calculation) => patchComponent(index, { calculation })} />
                <details className="pricing-component-advanced">
                  <summary>{copy(locale, 'Advanced: priority, dates, and rounding', 'متقدم: الأولوية والتواريخ والتقريب')}</summary>
                  <div>
                    <label className="field"><span>{copy(locale, 'Priority', 'الأولوية')}</span><input onChange={(event) => patchComponent(index, { priority: Math.round(numberValue(event.target.value)) })} step="1" type="number" value={component.priority} /></label>
                    <label className="field"><span>{copy(locale, 'Effective from', 'ساري من')}</span><input onChange={(event) => patchComponent(index, { effectiveFrom: event.target.value || undefined })} type="date" value={component.effectiveFrom ?? ''} /></label>
                    <label className="field"><span>{copy(locale, 'Effective until', 'ساري حتى')}</span><input onChange={(event) => patchComponent(index, { effectiveUntil: event.target.value || undefined })} type="date" value={component.effectiveUntil ?? ''} /></label>
                    <label className="field"><span>{copy(locale, 'Precision', 'الدقة')}</span><Select onChange={(event) => patchComponent(index, { rounding: { ...component.rounding, precision: Number(event.target.value) as 0 | 2 } })} value={component.rounding.precision}><option value="2">{copy(locale, 'Piastre (0.01)', 'قرش (0.01)')}</option><option value="0">{copy(locale, 'Whole pound', 'جنيه كامل')}</option></Select></label>
                    <label className="field"><span>{copy(locale, 'Rounding increment', 'خطوة التقريب')}</span><input min="0" onChange={(event) => patchComponent(index, { rounding: { ...component.rounding, increment: event.target.value === '' ? undefined : numberValue(event.target.value) } })} placeholder="0.50 / 1.00" step="0.01" type="number" value={component.rounding.increment ?? ''} /></label>
                  </div>
                </details>
                <div className="pricing-conditions-editor">
                  <div className="pricing-conditions-editor__head"><span>{copy(locale, 'Conditions', 'الشروط')}</span><Button onClick={() => patchComponent(index, { conditions: [...component.conditions, { field: 'amount', operator: 'gte', value: 0 }] })}>{copy(locale, 'Add condition', 'إضافة شرط')}</Button></div>
                  {component.conditions.map((condition, conditionIndex) => (
                    <div className="pricing-condition-row" key={`${component.id}-${conditionIndex}`}>
                      <Select aria-label={copy(locale, `Condition ${conditionIndex + 1} field`, `حقل الشرط ${conditionIndex + 1}`)} onChange={(event) => {
                        const field = event.target.value as PricingCondition['field'];
                        patchComponent(index, { conditions: component.conditions.map((candidate, row) => row === conditionIndex ? { ...candidate, field, value: conditionValue(field, '') } : candidate) });
                      }} value={condition.field}>{pricingConditionFields.map((field) => <option key={field} value={field}>{field.replaceAll('_', ' ')}</option>)}</Select>
                      <Select aria-label={copy(locale, `Condition ${conditionIndex + 1} operator`, `عملية الشرط ${conditionIndex + 1}`)} onChange={(event) => patchComponent(index, { conditions: component.conditions.map((candidate, row) => row === conditionIndex ? { ...candidate, operator: event.target.value as PricingCondition['operator'] } : candidate) })} value={condition.operator}>{pricingConditionOperators.map((operator) => <option key={operator} value={operator}>{operator}</option>)}</Select>
                      {condition.field === 'same_provider' ? <Select aria-label={copy(locale, `Condition ${conditionIndex + 1} value`, `قيمة الشرط ${conditionIndex + 1}`)} onChange={(event) => patchComponent(index, { conditions: component.conditions.map((candidate, row) => row === conditionIndex ? { ...candidate, value: event.target.value === 'true' } : candidate) })} value={String(condition.value)}><option value="true">true</option><option value="false">false</option></Select> : <input aria-label={copy(locale, `Condition ${conditionIndex + 1} value`, `قيمة الشرط ${conditionIndex + 1}`)} onChange={(event) => patchComponent(index, { conditions: component.conditions.map((candidate, row) => row === conditionIndex ? { ...candidate, value: conditionValue(condition.field, event.target.value) } : candidate) })} type={condition.field === 'amount' || condition.field === 'transaction_count' ? 'number' : condition.field === 'date' ? 'date' : 'text'} value={String(condition.value)} />}
                      {condition.operator === 'between' && <input aria-label={copy(locale, `Condition ${conditionIndex + 1} end`, `نهاية الشرط ${conditionIndex + 1}`)} onChange={(event) => patchComponent(index, { conditions: component.conditions.map((candidate, row) => row === conditionIndex ? { ...candidate, valueTo: conditionValue(condition.field, event.target.value) as number | string } : candidate) })} type={condition.field === 'amount' || condition.field === 'transaction_count' ? 'number' : condition.field === 'date' ? 'date' : 'text'} value={String(condition.valueTo ?? '')} />}
                      <button aria-label={copy(locale, 'Remove condition', 'حذف الشرط')} className="icon-button" onClick={() => patchComponent(index, { conditions: component.conditions.filter((_, row) => row !== conditionIndex) })} type="button"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <footer className="pricing-editor__footer">
            <Button onClick={() => { setDraft(undefined); setEditingId(undefined); }}>{copy(locale, 'Cancel', 'إلغاء')}</Button>
            <Button disabled={saving || !draft.name.trim()} onClick={() => void save()} variant="primary">{saving ? copy(locale, 'Saving…', 'جارٍ الحفظ…') : copy(locale, 'Save pricing profile', 'حفظ ملف التسعير')}</Button>
          </footer>
        </div>
      )}
    </div>
  );
}

function CalculationFields({ calculation, locale, onChange }: Readonly<{ calculation: PricingCalculation; locale: Locale; onChange: (calculation: PricingCalculation) => void }>) {
  if (calculation.kind === 'conversion') return <div className="pricing-calculation-fields"><label className="field"><span>{copy(locale, 'Conversion rate', 'معدل التحويل')}</span><input min="0.000001" onChange={(event) => onChange({ ...calculation, rate: numberValue(event.target.value) })} step="0.0001" type="number" value={calculation.rate} /></label></div>;
  if (calculation.kind === 'lookup') return <div className="pricing-table-editor"><div className="pricing-table-head"><span>{copy(locale, 'Customer pays', 'العميل يدفع')}</span><span>{copy(locale, 'Delivered value', 'القيمة المستلمة')}</span><span>{copy(locale, 'Provider cost', 'تكلفة المزود')}</span><span /></div>{calculation.entries.map((entry, index) => <div className="pricing-table-row" key={index}><input aria-label={copy(locale, `Lookup payment ${index + 1}`, `مدفوع صف ${index + 1}`)} onChange={(event) => onChange({ ...calculation, entries: calculation.entries.map((candidate, row) => row === index ? { ...candidate, customerPays: numberValue(event.target.value) } : candidate) })} type="number" value={entry.customerPays} /><input aria-label={copy(locale, `Lookup delivered ${index + 1}`, `مستلم صف ${index + 1}`)} onChange={(event) => onChange({ ...calculation, entries: calculation.entries.map((candidate, row) => row === index ? { ...candidate, deliveredValue: numberValue(event.target.value) } : candidate) })} type="number" value={entry.deliveredValue} /><input aria-label={copy(locale, `Lookup cost ${index + 1}`, `تكلفة صف ${index + 1}`)} onChange={(event) => onChange({ ...calculation, entries: calculation.entries.map((candidate, row) => row === index ? { ...candidate, providerCost: numberValue(event.target.value) } : candidate) })} type="number" value={entry.providerCost ?? 0} /><button aria-label={copy(locale, 'Remove row', 'حذف الصف')} className="icon-button" onClick={() => onChange({ ...calculation, entries: calculation.entries.filter((_, row) => row !== index) })} type="button"><Trash2 size={14} /></button></div>)}<Button onClick={() => onChange({ ...calculation, entries: [...calculation.entries, { customerPays: 0, deliveredValue: 0 }] })}>{copy(locale, 'Add lookup row', 'إضافة صف')}</Button></div>;
  if (calculation.kind === 'tiered') return <div className="pricing-table-editor pricing-tier-editor"><div className="pricing-tier-head"><span>{copy(locale, 'Range', 'النطاق')}</span><span>{copy(locale, 'Calculation', 'الحساب')}</span><span>{copy(locale, 'Values', 'القيم')}</span><span /></div>{calculation.tiers.map((tier, index) => <div className="pricing-tier-row" key={index}>
    <div><input aria-label={copy(locale, `Tier from ${index + 1}`, `بداية الشريحة ${index + 1}`)} onChange={(event) => onChange({ ...calculation, tiers: calculation.tiers.map((candidate, row) => row === index ? { ...candidate, from: numberValue(event.target.value) } : candidate) })} placeholder={copy(locale, 'From', 'من')} type="number" value={tier.from} /><input aria-label={copy(locale, `Tier to ${index + 1}`, `نهاية الشريحة ${index + 1}`)} onChange={(event) => onChange({ ...calculation, tiers: calculation.tiers.map((candidate, row) => row === index ? { ...candidate, to: event.target.value === '' ? undefined : numberValue(event.target.value) } : candidate) })} placeholder={copy(locale, 'To', 'إلى')} type="number" value={tier.to ?? ''} /></div>
    <Select aria-label={copy(locale, `Tier calculation ${index + 1}`, `حساب الشريحة ${index + 1}`)} onChange={(event) => { const next = defaultCalculation(event.target.value as SimplePricingCalculation['kind']) as SimplePricingCalculation; onChange({ ...calculation, tiers: calculation.tiers.map((candidate, row) => row === index ? { ...candidate, calculation: next } : candidate) }); }} value={tier.calculation.kind}>{(['fixed', 'percentage', 'percentage_min_max', 'fixed_plus_percentage'] as const).map((kind) => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}</Select>
    <div className="pricing-tier-values">{(tier.calculation.kind === 'fixed' || tier.calculation.kind === 'fixed_plus_percentage') && <input aria-label={copy(locale, `Tier fixed ${index + 1}`, `ثابت الشريحة ${index + 1}`)} onChange={(event) => onChange({ ...calculation, tiers: calculation.tiers.map((candidate, row) => row === index ? { ...candidate, calculation: { ...candidate.calculation, fixedAmount: numberValue(event.target.value) } } : candidate) })} placeholder={copy(locale, 'Fixed', 'ثابت')} type="number" value={tier.calculation.fixedAmount ?? ''} />}{tier.calculation.kind !== 'fixed' && <input aria-label={copy(locale, `Tier rate ${index + 1}`, `نسبة الشريحة ${index + 1}`)} onChange={(event) => onChange({ ...calculation, tiers: calculation.tiers.map((candidate, row) => row === index ? { ...candidate, calculation: { ...candidate.calculation, rate: numberValue(event.target.value) } } : candidate) })} placeholder="%" type="number" value={tier.calculation.rate ?? ''} />}{tier.calculation.kind === 'percentage_min_max' && <><input aria-label={copy(locale, `Tier minimum ${index + 1}`, `أدنى الشريحة ${index + 1}`)} onChange={(event) => onChange({ ...calculation, tiers: calculation.tiers.map((candidate, row) => row === index ? { ...candidate, calculation: { ...candidate.calculation, minimum: event.target.value === '' ? undefined : numberValue(event.target.value) } } : candidate) })} placeholder="Min" type="number" value={tier.calculation.minimum ?? ''} /><input aria-label={copy(locale, `Tier maximum ${index + 1}`, `أقصى الشريحة ${index + 1}`)} onChange={(event) => onChange({ ...calculation, tiers: calculation.tiers.map((candidate, row) => row === index ? { ...candidate, calculation: { ...candidate.calculation, maximum: event.target.value === '' ? undefined : numberValue(event.target.value) } } : candidate) })} placeholder="Max" type="number" value={tier.calculation.maximum ?? ''} /></>}</div>
    <button aria-label={copy(locale, 'Remove tier', 'حذف الشريحة')} className="icon-button" onClick={() => onChange({ ...calculation, tiers: calculation.tiers.filter((_, row) => row !== index) })} type="button"><Trash2 size={14} /></button>
  </div>)}<Button onClick={() => onChange({ ...calculation, tiers: [...calculation.tiers, { calculation: { fixedAmount: 0, kind: 'fixed' }, from: calculation.tiers.at(-1)?.to === undefined ? 0 : (calculation.tiers.at(-1)?.to ?? 0) + 0.01 }] })}>{copy(locale, 'Add band', 'إضافة شريحة')}</Button></div>;
  return <div className="pricing-calculation-fields">
    {(calculation.kind === 'fixed' || calculation.kind === 'fixed_plus_percentage') && <label className="field"><span>{copy(locale, 'Fixed amount', 'المبلغ الثابت')}</span><input min="0" onChange={(event) => onChange({ ...calculation, fixedAmount: numberValue(event.target.value) })} step="0.01" type="number" value={calculation.fixedAmount ?? 0} /></label>}
    {calculation.kind !== 'fixed' && <label className="field"><span>{copy(locale, 'Percentage %', 'النسبة %')}</span><input min="0" onChange={(event) => onChange({ ...calculation, rate: numberValue(event.target.value) })} step="0.001" type="number" value={calculation.rate ?? 0} /></label>}
    {calculation.kind === 'percentage_min_max' && <><label className="field"><span>{copy(locale, 'Minimum', 'الحد الأدنى')}</span><input min="0" onChange={(event) => onChange({ ...calculation, minimum: event.target.value === '' ? undefined : numberValue(event.target.value) })} placeholder="Optional" step="0.01" type="number" value={calculation.minimum ?? ''} /></label><label className="field"><span>{copy(locale, 'Maximum', 'الحد الأقصى')}</span><input min="0" onChange={(event) => onChange({ ...calculation, maximum: event.target.value === '' ? undefined : numberValue(event.target.value) })} placeholder="Optional" step="0.01" type="number" value={calculation.maximum ?? ''} /></label></>}
  </div>;
}
