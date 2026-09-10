import { Terms } from '../ui/terms';
import {
  CheckCircle2,
  Database,
  Check,
  Globe2,
  ArrowRight,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react';

import type { BackupSchedule, Blueprint } from '../../shared/blueprint-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { onboardingCopy } from './onboarding-i18n';
import maxLogoReference from '../assets/max-logo.png';

function playWelcomeSound(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return;
  try {
    const context = new AudioContextConstructor();
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.1);
    gain.connect(context.destination);
    // An original, slowly resolving five-note arrival cue. It is deliberately
    // longer than an interaction sound, without reproducing a branded chime.
    const notes = [
      { at: 0, duration: 1.7, frequency: 220 },
      { at: 0.48, duration: 1.8, frequency: 293.66 },
      { at: 0.96, duration: 1.95, frequency: 369.99 },
      { at: 1.52, duration: 2.05, frequency: 440 },
      { at: 2.1, duration: 1.8, frequency: 587.33 },
    ];
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = note.at === 0 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, now + note.at);
      oscillator.detune.setValueAtTime(-7, now + note.at);
      voiceGain.gain.setValueAtTime(0.0001, now + note.at);
      voiceGain.gain.exponentialRampToValueAtTime(0.34, now + note.at + 0.16);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.duration);
      oscillator.connect(voiceGain); voiceGain.connect(gain);
      oscillator.start(now + note.at); oscillator.stop(now + note.at + note.duration + 0.05);
    }
    void context.resume();
    window.setTimeout(() => { void context.close(); }, 4_400);
  } catch { /* Audio is an optional welcome enhancement. */ }
}

type OnboardingProps = Readonly<{
  initialLocale: Locale;
  onComplete: (shopName: string, locale: Locale, backupSchedule: BackupSchedule, blueprint?: Blueprint, includeDemoData?: boolean, templateId?: 'blank' | 'custom' | 'phone-shop') => Promise<void>;
  onClose?: () => void;
  preview?: boolean;
}>;

export function Onboarding({ initialLocale, onClose, onComplete, preview = false }: OnboardingProps) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [step, setStep] = useState(1);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [showWelcome, setShowWelcome] = useState(!preview);
  const [shopName, setShopName] = useState('');
  const [template, setTemplate] = useState<'blank' | 'custom'>('blank');
  const [backupSchedule, setBackupSchedule] = useState<BackupSchedule>('daily');
  const [submitting, setSubmitting] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const [blueprint, setBlueprint] = useState<Blueprint>();
  const [blueprintError, setBlueprintError] = useState<string>();

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBlueprintError(undefined);
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = await window.maxApi.workspace.validateTemplate(parsed);
      if (result.ok) {
        setBlueprint(parsed as Blueprint);
        setTemplate('custom');
      } else {
        setBlueprintError(result.error.message);
        setTemplate('blank');
      }
    } catch (e) {
      setBlueprintError(e instanceof Error ? e.message : 'Invalid JSON file.');
      setTemplate('blank');
    }
  }

  function handleLanguageChange(nextLocale: Locale) {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = nextLocale === 'ar' ? 'rtl' : 'ltr';
  }

  useEffect(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }, []);

  useEffect(() => {
    if (!showWelcome) return;
    const timer = window.setTimeout(playWelcomeSound, 320);
    return () => window.clearTimeout(timer);
  }, [showWelcome]);

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.defaultPrevented) {
        const btn = document.querySelector<HTMLButtonElement>('.onboarding-welcome__button, .onboarding-actions .apple-button');
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  async function handleFinish(event: FormEvent) {
    event.preventDefault();
    if (!acceptedTerms || submitting || !shopName.trim()) return;
    setFinishError(undefined);
    setSubmitting(true);
    try {
      await onComplete(shopName.trim() || 'My Shop', locale, backupSchedule, template === 'custom' ? blueprint : undefined, false, template);
    } catch (error) {
      setFinishError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const isRtl = locale === 'ar';

  if (showWelcome) {
    return (
      <div className="onboarding-container onboarding-container--welcome" dir="ltr">
        <main className="onboarding-welcome" aria-labelledby="welcome-to-max">
          <div className="onboarding-welcome__ambient onboarding-welcome__ambient--one" aria-hidden="true" />
          <div className="onboarding-welcome__ambient onboarding-welcome__ambient--two" aria-hidden="true" />
          <div className="onboarding-welcome__orb" aria-hidden="true" />
          <div className="onboarding-welcome__content">
            <h1 id="welcome-to-max" className="sr-only">Welcome to Max</h1>
            <div className="onboarding-welcome__mark-wrap"><img alt="" className="onboarding-welcome__logo" src={maxLogoReference} /></div>
            <button autoFocus aria-label="Continue to setup" className="onboarding-welcome__button" onClick={() => setShowWelcome(false)} type="button"><ArrowRight aria-hidden="true" size={18} /></button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="onboarding-container" data-locale={locale} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="onboarding-card">
        <header className="onboarding-card__header">
          <div className="brand" aria-label="Max" role="img">
            <img alt="Max" className="onboarding-brand-logo" src={maxLogoReference} />
          </div>
          {preview && onClose && <Button onClick={onClose}>{locale === 'ar' ? 'إغلاق المعاينة' : 'Close preview'}</Button>}
        </header>

        <main className="onboarding-card__body" key={step}>
          {finishError && <p className="form-error" role="alert">{finishError}</p>}
          {/* STEP 1: LANGUAGE */}
          {step === 1 && (
            <div
              className="onboarding-step"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setStep(2);
                }
              }}
            >
              <p className="eyebrow">{onboardingCopy(locale, 'onboardingTitle')}</p>
              <div className="language-heading"><Globe2 aria-hidden="true" size={18} /><h2>{onboardingCopy(locale, 'languageTitle')}</h2></div>
              <p className="step-subtitle">{onboardingCopy(locale, 'languageSubtitle')}</p>

              <div className="language-list" role="radiogroup">
                <button
                  aria-checked={locale === 'en'}
                  autoFocus={locale === 'en'}
                  className="language-item"
                  data-selected={locale === 'en'}
                  onClick={() => handleLanguageChange('en')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleLanguageChange('en');
                      if (e.key === 'Enter') setStep(2);
                    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      handleLanguageChange('ar');
                    }
                  }}
                  role="radio"
                  tabIndex={0}
                  type="button"
                >
                  <span className="language-item__identity"><span className="language-item__monogram">EN</span><span><span className="language-item__title" lang="en">English</span><span className="language-item__native">English</span></span></span>
                  <span className="language-item__selection"><span className="language-item__meta">Left-to-right</span>{locale === 'en' && <Check aria-hidden="true" size={17} />}</span>
                </button>

                <button
                  aria-checked={locale === 'ar'}
                  autoFocus={locale === 'ar'}
                  className="language-item"
                  data-selected={locale === 'ar'}
                  onClick={() => handleLanguageChange('ar')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleLanguageChange('ar');
                      if (e.key === 'Enter') setStep(2);
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      handleLanguageChange('en');
                    }
                  }}
                  role="radio"
                  tabIndex={0}
                  type="button"
                >
                  <span className="language-item__identity"><span className="language-item__monogram" lang="en">AR</span><span><span className="language-item__title" lang="ar">العربية</span><span className="language-item__native">Arabic</span></span></span>
                  <span className="language-item__selection"><span className="language-item__meta">من اليمين لليسار</span>{locale === 'ar' && <Check aria-hidden="true" size={17} />}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: SHOP NAME */}
          {step === 2 && (
            <div
              className="onboarding-step"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && shopName.trim()) {
                  e.preventDefault();
                  setStep(3);
                }
              }}
            >
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
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && shopName.trim()) {
                        event.preventDefault();
                        setStep(3);
                      }
                    }}
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
            <div
              className="onboarding-step"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setStep(4);
                }
              }}
            >
              <p className="eyebrow">
                {onboardingCopy(locale, 'step')} 3 {onboardingCopy(locale, 'stepOf')} 5
              </p>
              <h2>{onboardingCopy(locale, 'chooseBlueprintTitle')}</h2>
              <p className="step-subtitle">{onboardingCopy(locale, 'chooseBlueprintSubtitle')}</p>

              <div className="choice-grid--large" role="radiogroup">
                <button
                  aria-checked={template === 'blank'}
                  className="choice-card--large"
                  data-selected={template === 'blank'}
                  onClick={() => { setTemplate('blank'); setBlueprint(undefined); setBlueprintError(undefined); }}
                  role="radio"
                  type="button"
                >
                  <strong>{onboardingCopy(locale, 'blankTitle')}</strong>
                  <p>{onboardingCopy(locale, 'blankSubtitle')}</p>
                </button>

                <label
                  aria-checked={template === 'custom'}
                  className="choice-card--large"
                  data-selected={template === 'custom'}
                  role="radio"
                >
                  <strong>{locale === 'ar' ? 'استيراد مخطط' : 'Import Blueprint'}</strong>
                  <p>{blueprint ? blueprint.name : locale === 'ar' ? 'ابدأ من ملف مخطط موجود.' : 'Start from an existing blueprint file.'}</p>
                  <input accept=".json,.max-blueprint.json" onChange={(e) => void handleFileSelect(e)} style={{ display: 'none' }} type="file" />
                </label>
              </div>
              {blueprintError && <p className="form-error" style={{ marginTop: '12px' }}>{blueprintError}</p>}
            </div>
          )}

          {/* STEP 4: BACKUP SCHEDULE */}
          {step === 4 && (
            <div
              className="onboarding-step"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setStep(5);
                }
              }}
            >
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
            <div
              className="onboarding-step onboarding-step--summary"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && acceptedTerms && !submitting) {
                  e.preventDefault();
                  void handleFinish(e);
                }
              }}
            >
              <p className="eyebrow">{onboardingCopy(locale, 'readyTitle')}</p>
              <h2>{shopName.trim() || 'My Shop'}</h2>
              <p className="step-subtitle">{onboardingCopy(locale, 'readySubtitle')}</p>

              <Terms locale={locale} onScrollToBottom={() => setHasReadTerms(true)} />
              <label className={`terms-acceptance ${!hasReadTerms ? 'terms-acceptance--disabled' : ''}`}>
                <input
                  checked={acceptedTerms}
                  disabled={!hasReadTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  type="checkbox"
                />
                {locale === 'ar' ? 'قرأت ووافقت على الشروط والأحكام' : 'I have read and agree to the Terms & Conditions'}
              </label>
              <div className="assembly-badge-list">
                <div className="assembly-badge">
                  <CheckCircle2 aria-hidden="true" size={16} />
                  <span>{onboardingCopy(locale, 'blankTitle')}</span>
                </div>
              </div>
            </div>
          )}

          <div className="onboarding-actions onboarding-actions--centered">
            <button
              className="apple-button"
              disabled={
                (step === 2 && !shopName.trim()) ||
                (step === 5 && (!acceptedTerms || submitting))
              }
              onClick={(e) => {
                if (step < 5) setStep((s) => s + 1);
                else void handleFinish(e);
              }}
              type="button"
            >
              {step < 5 ? onboardingCopy(locale, 'continue') : onboardingCopy(locale, 'enterWorkspace')}
            </button>

            {step > 1 && (
              <button
                className="onboarding-back-btn"
                onClick={() => setStep((s) => s - 1)}
                type="button"
              >
                {onboardingCopy(locale, 'previous')}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
