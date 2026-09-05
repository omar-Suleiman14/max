import { Terms } from '../ui/terms';
import { Select } from '../ui/select';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  Sparkles,
} from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import type { BackupSchedule, Blueprint } from '../../shared/blueprint-contract';
import type { Locale } from '../app/i18n';
import { phoneShopBlueprint } from '../blueprints/starter-blueprints';
import { Button } from '../ui/button';
import { onboardingCopy } from './onboarding-i18n';
import maxLogoReference from '../assets/max-logo.png';

type OnboardingProps = Readonly<{
  initialLocale: Locale;
  onComplete: (shopName: string, locale: Locale, backupSchedule: BackupSchedule, blueprint?: Blueprint, includeDemoData?: boolean, templateId?: 'blank' | 'custom' | 'phone-shop') => Promise<void>;
  onClose?: () => void;
  preview?: boolean;
}>;

type BlueprintOption = 'blank' | 'custom' | 'phone';

export function Onboarding({ initialLocale, onClose, onComplete, preview = false }: OnboardingProps) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [step, setStep] = useState(1);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [shopName, setShopName] = useState('');
  const [blueprintChoice, setBlueprintChoice] = useState<BlueprintOption>('phone');
  const [customBlueprint, setCustomBlueprint] = useState<Blueprint>();
  const [customFileError, setCustomFileError] = useState<string>();
  const [backupSchedule, setBackupSchedule] = useState<BackupSchedule>('daily');
  const [includeDemoData, setIncludeDemoData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finishError, setFinishError] = useState<string>();

  function handleLanguageChange(nextLocale: Locale) {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = nextLocale === 'ar' ? 'rtl' : 'ltr';
  }

  async function handleCustomFile(event: ChangeEvent<HTMLInputElement>) {
    setCustomFileError(undefined);
    setCustomBlueprint(undefined);
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const validation = await window.maxApi.blueprints.validate(parsed);
      if (validation.valid) {
        setCustomBlueprint(parsed as Blueprint);
      } else {
        setCustomFileError(validation.issues[0]?.message ?? onboardingCopy(locale, 'invalidFile'));
      }
    } catch {
      setCustomFileError(onboardingCopy(locale, 'invalidFile'));
    }
  }

  const selectedBlueprint: Blueprint | undefined =
    blueprintChoice === 'phone'
      ? phoneShopBlueprint
      : blueprintChoice === 'custom'
        ? customBlueprint
        : undefined;

  async function handleFinish(event: FormEvent) {
    event.preventDefault();
    if (!acceptedTerms || submitting || !shopName.trim() || (blueprintChoice === 'custom' && !customBlueprint)) return;
    setFinishError(undefined);
    setSubmitting(true);
    try {
      await onComplete(shopName.trim() || 'My Shop', locale, backupSchedule, selectedBlueprint, blueprintChoice === 'phone' && includeDemoData, blueprintChoice === 'phone' ? 'phone-shop' : blueprintChoice);
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const isRtl = locale === 'ar';
  const NextIcon = isRtl ? ArrowLeft : ArrowRight;
  const PrevIcon = isRtl ? ArrowRight : ArrowLeft;

  return (
    <div className="onboarding-container" data-locale={locale} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="onboarding-card">
        <header className="onboarding-card__header">
          <div className="brand" aria-label="Max">
            <span className="onboarding-brand-symbol"><img alt="" src={maxLogoReference} /></span>
            <strong className="onboarding-brand-name">MAX</strong>
            <small className="onboarding-brand-version">v0.2.8</small>
          </div>
          <div className="onboarding-steps-indicator" aria-label={`Step ${step} of 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className={`step-dot ${step === i ? 'step-dot--active' : step > i ? 'step-dot--completed' : ''}`}
              />
            ))}
          </div>
          {preview && onClose && <Button onClick={onClose}>{locale === 'ar' ? 'إغلاق المعاينة' : 'Close preview'}</Button>}
        </header>

        <main className="onboarding-card__body" key={step}>
          {finishError && <p className="form-error" role="alert">{finishError}</p>}
          {/* STEP 1: LANGUAGE */}
          {step === 1 && (
            <div className="onboarding-step">
              <p className="eyebrow">{onboardingCopy(locale, 'onboardingTitle')}</p>
              <h2>{onboardingCopy(locale, 'languageTitle')}</h2>
              <p className="step-subtitle">{onboardingCopy(locale, 'languageSubtitle')}</p>

              <div className="choice-grid choice-grid--large" role="radiogroup">
                <button
                  aria-checked={locale === 'en'}
                  className="choice-card choice-card--large"
                  data-selected={locale === 'en'}
                  onClick={() => handleLanguageChange('en')}
                  role="radio"
                  type="button"
                >
                  <span className="choice-card__title">English</span>
                  <small>Left-to-right interface</small>
                </button>

                <button
                  aria-checked={locale === 'ar'}
                  className="choice-card choice-card--large"
                  data-selected={locale === 'ar'}
                  onClick={() => handleLanguageChange('ar')}
                  role="radio"
                  type="button"
                >
                  <span className="choice-card__title">العربية</span>
                  <small>واجهة من اليمين إلى اليسار</small>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: SHOP NAME */}
          {step === 2 && (
            <div className="onboarding-step">
              <p className="eyebrow">
                {onboardingCopy(locale, 'step')} 2 {onboardingCopy(locale, 'stepOf')} 5
              </p>
              <h2>{onboardingCopy(locale, 'shopNameTitle')}</h2>
              <p className="step-subtitle">{onboardingCopy(locale, 'shopNameSubtitle')}</p>

              <div className="field-group">
                <label className="field">
                  <input
                    autoFocus
                    className="field__input--large"
                    maxLength={120}
                    onChange={(event) => setShopName(event.target.value)}
                    placeholder={onboardingCopy(locale, 'shopNameHint')}
                    required
                    value={shopName}
                  />
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: BLUEPRINT */}
          {step === 3 && (
            <div className="onboarding-step">
              <p className="eyebrow">
                {onboardingCopy(locale, 'step')} 3 {onboardingCopy(locale, 'stepOf')} 5
              </p>
              <h2>{onboardingCopy(locale, 'chooseBlueprintTitle')}</h2>
              <p className="step-subtitle">{onboardingCopy(locale, 'chooseBlueprintSubtitle')}</p>

              <label className="field onboarding-template-picker">
                <span>{locale === 'ar' ? 'قالب مساحة العمل' : 'Workspace template'}</span>
                <Select className="field__input--large" onChange={(event) => setBlueprintChoice(event.target.value as BlueprintOption)} value={blueprintChoice}>
                  <option value="phone">{locale === 'ar' ? 'متجر الهواتف — موصى به' : 'Phone Shop — Recommended'}</option>
                  <option value="blank">{onboardingCopy(locale, 'blankTitle')}</option>
                  <option value="custom">{onboardingCopy(locale, 'importCustomTitle')}</option>
                </Select>
              </label>

              <div className="template-preview-card">
                <strong>{blueprintChoice === 'phone' ? onboardingCopy(locale, 'phoneShopTitle') : blueprintChoice === 'blank' ? onboardingCopy(locale, 'blankTitle') : onboardingCopy(locale, 'importCustomTitle')}</strong>
                <p>{blueprintChoice === 'phone'
                  ? (locale === 'ar' ? 'الأصناف والأجهزة والأشخاص والحسابات والمعاملات، طرق الدفع المصرية، الرسوم، المخزون، عروض اليوم والأسبوع والشهر، وصفحات وعمليات جاهزة.' : 'Items and devices, people, accounts, transactions, Egyptian payment methods, fees, inventory, day/week/month views, pages, and ready operations.')
                  : blueprintChoice === 'blank' ? onboardingCopy(locale, 'blankSubtitle') : onboardingCopy(locale, 'importCustomSubtitle')}</p>
              </div>

              {blueprintChoice === 'phone' && (
                <button
                  aria-checked={includeDemoData}
                  className="choice-card choice-card--row onboarding-demo-toggle"
                  data-selected={includeDemoData}
                  onClick={() => setIncludeDemoData((enabled) => !enabled)}
                  role="checkbox"
                  type="button"
                >
                  <div className="choice-card__icon"><Sparkles aria-hidden="true" size={22} /></div>
                  <div>
                    <strong className="choice-card__title">{locale === 'ar' ? 'إضافة بيانات تجريبية' : 'Add demo workspace data'}</strong>
                    <p className="choice-card__desc">{locale === 'ar' ? 'حسابات وأصناف وأشخاص ومعاملات وصفحات جاهزة للاستكشاف.' : 'Prefill accounts, items, people, transactions, views, and custom pages.'}</p>
                  </div>
                </button>
              )}

              {blueprintChoice === 'custom' && (
                <div className="custom-blueprint-upload">
                  <label className="button button--secondary">
                    {onboardingCopy(locale, 'selectFile')}
                    <input accept=".json,.max-blueprint.json" onChange={(event) => void handleCustomFile(event)} style={{ display: 'none' }} type="file" />
                  </label>
                  {customBlueprint && (
                    <p className="form-success">
                      <CheckCircle2 aria-hidden="true" size={16} />
                      {customBlueprint.name} ({customBlueprint.properties.item.length} item props, {customBlueprint.properties.person.length} person props)
                    </p>
                  )}
                  {customFileError && <p className="form-error">{customFileError}</p>}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: BACKUP SCHEDULE */}
          {step === 4 && (
            <div className="onboarding-step">
              <p className="eyebrow">
                {onboardingCopy(locale, 'step')} 4 {onboardingCopy(locale, 'stepOf')} 5
              </p>
              <h2>{onboardingCopy(locale, 'backupScheduleTitle')}</h2>
              <p className="step-subtitle">{onboardingCopy(locale, 'backupScheduleSubtitle')}</p>

              <div className="choice-stack" role="radiogroup">
                <button
                  aria-checked={backupSchedule === 'daily'}
                  className="choice-card choice-card--row"
                  data-selected={backupSchedule === 'daily'}
                  onClick={() => setBackupSchedule('daily')}
                  role="radio"
                  type="button"
                >
                  <div className="choice-card__icon">
                    <Database aria-hidden="true" size={22} />
                  </div>
                  <div>
                    <strong className="choice-card__title">{onboardingCopy(locale, 'backupDaily')}</strong>
                    <p className="choice-card__desc">{onboardingCopy(locale, 'backupDailyDesc')}</p>
                  </div>
                </button>

                <button
                  aria-checked={backupSchedule === 'weekly'}
                  className="choice-card choice-card--row"
                  data-selected={backupSchedule === 'weekly'}
                  onClick={() => setBackupSchedule('weekly')}
                  role="radio"
                  type="button"
                >
                  <div className="choice-card__icon">
                    <Database aria-hidden="true" size={22} />
                  </div>
                  <div>
                    <strong className="choice-card__title">{onboardingCopy(locale, 'backupWeekly')}</strong>
                    <p className="choice-card__desc">{onboardingCopy(locale, 'backupWeeklyDesc')}</p>
                  </div>
                </button>

                <button
                  aria-checked={backupSchedule === 'manual'}
                  className="choice-card choice-card--row"
                  data-selected={backupSchedule === 'manual'}
                  onClick={() => setBackupSchedule('manual')}
                  role="radio"
                  type="button"
                >
                  <div className="choice-card__icon">
                    <Database aria-hidden="true" size={22} />
                  </div>
                  <div>
                    <strong className="choice-card__title">{onboardingCopy(locale, 'backupManual')}</strong>
                    <p className="choice-card__desc">{onboardingCopy(locale, 'backupManualDesc')}</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: SUMMARY & FINISH */}
          {step === 5 && (
            <div className="onboarding-step onboarding-step--summary">
              <div className="summary-icon-glow">
                <Sparkles aria-hidden="true" size={38} />
              </div>
              <p className="eyebrow">{onboardingCopy(locale, 'readyTitle')}</p>
              <h2>{shopName.trim() || 'My Shop'}</h2>
              <p className="step-subtitle">{onboardingCopy(locale, 'readySubtitle')}</p>

              <Terms locale={locale} />
              <label className="terms-acceptance"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />{locale === 'ar' ? 'قرأت ووافقت على الشروط والأحكام' : 'I have read and agree to the Terms & Conditions'}</label>
              <div className="assembly-badge-list">
                {blueprintChoice === 'phone' ? (
                  <>
                    <div className="assembly-badge">
                      <CheckCircle2 aria-hidden="true" size={16} />
                      <span>{locale === 'ar' ? '٦ قواعد مترابطة وقوالب للسجلات والصفحات' : '6 relational databases with record and page templates'}</span>
                    </div>
                    {includeDemoData && (
                      <div className="assembly-badge">
                        <Sparkles aria-hidden="true" size={16} />
                        <span>{locale === 'ar' ? 'بيانات وصفحات تجريبية جاهزة' : 'Demo data and custom pages ready'}</span>
                      </div>
                    )}
                    <div className="assembly-badge">
                      <CheckCircle2 aria-hidden="true" size={16} />
                      <span>{locale === 'ar' ? 'عروض اليوم والأسبوع والشهر بحسابات من قاعدة البيانات' : 'Database-backed day, week, and month views'}</span>
                    </div>
                    <div className="assembly-badge">
                      <CheckCircle2 aria-hidden="true" size={16} />
                      <span>{locale === 'ar' ? 'بيع سريع وطرق دفع ورسوم قابلة للتعديل' : 'Quick Sale, payment methods, and editable fees'}</span>
                    </div>
                  </>
                ) : blueprintChoice === 'custom' && selectedBlueprint ? (
                  <div className="assembly-badge"><CheckCircle2 aria-hidden="true" size={16} /><span>{selectedBlueprint.name}</span></div>
                ) : (
                  <div className="assembly-badge">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    <span>{onboardingCopy(locale, 'blankTitle')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <footer className="onboarding-card__footer">
          {step > 1 ? (
            <Button icon={<PrevIcon aria-hidden="true" size={16} />} onClick={() => setStep((s) => s - 1)}>
              {onboardingCopy(locale, 'previous')}
            </Button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <Button
              disabled={(step === 2 && !shopName.trim()) || (step === 3 && blueprintChoice === 'custom' && !customBlueprint)}
              icon={<NextIcon aria-hidden="true" size={16} />}
              onClick={() => setStep((s) => s + 1)}
              variant="primary"
            >
              {onboardingCopy(locale, 'continue')}
            </Button>
          ) : (
            <Button
              disabled={!acceptedTerms || submitting || (blueprintChoice === 'custom' && !customBlueprint)}
              icon={<Sparkles aria-hidden="true" size={16} />}
              onClick={(e) => void handleFinish(e)}
              variant="primary"
            >
              {onboardingCopy(locale, 'enterWorkspace')}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
