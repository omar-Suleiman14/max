import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  FileCode,
  Layers,
  Sparkles,
  Store,
} from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import type { BackupSchedule, Blueprint } from '../../shared/blueprint-contract';
import type { Locale } from '../app/i18n';
import { phoneShopBlueprint } from '../blueprints/starter-blueprints';
import { Button } from '../ui/button';
import { onboardingCopy } from './onboarding-i18n';

type OnboardingProps = Readonly<{
  initialLocale: Locale;
  onComplete: (shopName: string, locale: Locale, backupSchedule: BackupSchedule, blueprint?: Blueprint) => Promise<void>;
}>;

type BlueprintOption = 'blank' | 'custom' | 'phone';

export function Onboarding({ initialLocale, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [shopName, setShopName] = useState('');
  const [blueprintChoice, setBlueprintChoice] = useState<BlueprintOption>('phone');
  const [customBlueprint, setCustomBlueprint] = useState<Blueprint>();
  const [customFileError, setCustomFileError] = useState<string>();
  const [backupSchedule, setBackupSchedule] = useState<BackupSchedule>('daily');
  const [submitting, setSubmitting] = useState(false);

  function handleLanguageChange(nextLocale: Locale) {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = nextLocale === 'ar' ? 'rtl' : 'ltr';
  }

  async function handleCustomFile(event: ChangeEvent<HTMLInputElement>) {
    setCustomFileError(undefined);
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
    setSubmitting(true);
    try {
      await onComplete(shopName.trim() || 'My Shop', locale, backupSchedule, selectedBlueprint);
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
            <span className="brand__mark">M</span>
            <span className="brand__wordmark">
              <strong>MAX</strong>
              <small>v0.1</small>
            </span>
          </div>
          <div className="onboarding-steps-indicator" aria-label={`Step ${step} of 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className={`step-dot ${step === i ? 'step-dot--active' : step > i ? 'step-dot--completed' : ''}`}
              />
            ))}
          </div>
        </header>

        <main className="onboarding-card__body">
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

              <div className="choice-stack" role="radiogroup">
                <button
                  aria-checked={blueprintChoice === 'phone'}
                  className="choice-card choice-card--row"
                  data-selected={blueprintChoice === 'phone'}
                  onClick={() => setBlueprintChoice('phone')}
                  role="radio"
                  type="button"
                >
                  <div className="choice-card__icon">
                    <Store aria-hidden="true" size={24} />
                  </div>
                  <div>
                    <strong className="choice-card__title">{onboardingCopy(locale, 'phoneShopTitle')}</strong>
                    <p className="choice-card__desc">{onboardingCopy(locale, 'phoneShopSubtitle')}</p>
                  </div>
                </button>

                <button
                  aria-checked={blueprintChoice === 'blank'}
                  className="choice-card choice-card--row"
                  data-selected={blueprintChoice === 'blank'}
                  onClick={() => setBlueprintChoice('blank')}
                  role="radio"
                  type="button"
                >
                  <div className="choice-card__icon">
                    <Layers aria-hidden="true" size={24} />
                  </div>
                  <div>
                    <strong className="choice-card__title">{onboardingCopy(locale, 'blankTitle')}</strong>
                    <p className="choice-card__desc">{onboardingCopy(locale, 'blankSubtitle')}</p>
                  </div>
                </button>

                <button
                  aria-checked={blueprintChoice === 'custom'}
                  className="choice-card choice-card--row"
                  data-selected={blueprintChoice === 'custom'}
                  onClick={() => setBlueprintChoice('custom')}
                  role="radio"
                  type="button"
                >
                  <div className="choice-card__icon">
                    <FileCode aria-hidden="true" size={24} />
                  </div>
                  <div>
                    <strong className="choice-card__title">{onboardingCopy(locale, 'importCustomTitle')}</strong>
                    <p className="choice-card__desc">{onboardingCopy(locale, 'importCustomSubtitle')}</p>
                  </div>
                </button>
              </div>

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

              <div className="assembly-badge-list">
                {selectedBlueprint ? (
                  <>
                    <div className="assembly-badge">
                      <CheckCircle2 aria-hidden="true" size={16} />
                      <span>{selectedBlueprint.properties.item.length} {onboardingCopy(locale, 'assembledItemCount')}</span>
                    </div>
                    <div className="assembly-badge">
                      <CheckCircle2 aria-hidden="true" size={16} />
                      <span>{selectedBlueprint.properties.person.length} {onboardingCopy(locale, 'assembledPersonCount')}</span>
                    </div>
                    <div className="assembly-badge">
                      <CheckCircle2 aria-hidden="true" size={16} />
                      <span>{selectedBlueprint.templates.length} {onboardingCopy(locale, 'assembledTemplateCount')}</span>
                    </div>
                  </>
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
              disabled={step === 2 && shopName.trim().length === 0}
              icon={<NextIcon aria-hidden="true" size={16} />}
              onClick={() => setStep((s) => s + 1)}
              variant="primary"
            >
              {onboardingCopy(locale, 'continue')}
            </Button>
          ) : (
            <Button
              disabled={submitting}
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
