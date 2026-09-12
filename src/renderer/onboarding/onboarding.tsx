import { Terms } from '../ui/terms';
import {
  CheckCircle2,
  Database,
  Check,
  Globe2,
  ArrowRight,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react';

import type { BackupSchedule } from '../../shared/blueprint-contract';
import type { WorkspaceTemplateV2 as Blueprint } from '../../shared/template-v2-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { useBlueprintFileDrop } from '../blueprints/blueprint-drop';
import { onboardingCopy } from './onboarding-i18n';
import maxLogoReference from '../assets/max-logo.png';

function playWelcomeSound(surface: HTMLElement): (() => void) | undefined {
  const beginMotion = () => { surface.dataset.arriving = 'true'; };
  beginMotion();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return;
  try {
    const context = new AudioContextConstructor();

    // The five voices overlap, so their sum has to be tamed somewhere. A limiter
    // does it at the end of the chain, which leaves the cue at a usable level;
    // scaling the master gain down far enough to never clip made the tail
    // inaudible instead.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(context.destination);
    const master = context.createGain();
    master.connect(limiter);

    let stopped = false;
    let timeout: number | undefined;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      try {
        // Fade out instead of closing the context under a sounding note, so
        // leaving the welcome screen mid-cue does not end on a click.
        const at = context.currentTime;
        master.gain.cancelScheduledValues(at);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), at);
        master.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      } catch { /* The context may already be closing. */ }
      window.setTimeout(() => { void context.close().catch(() => {}); }, 220);
    };

    // The cue is the entrance, heard. Every note is placed on a moment the
    // welcome screen is already moving through - the washes unfolding, the
    // logo overshooting at 35% and settling at 65%, the button arriving - and
    // they all release together as the motion comes to rest. `entrance` is the
    // 4.4s animation-duration the welcome screen is authored to in styles.css;
    // the two have to be changed together or the melody stops describing it.
    const entrance = 4.4;
    const notes = [
      // The ground the whole arrival stands on, held from first frame to last.
      { at: 0, duration: entrance, frequency: 98, peak: 0.15, type: 'triangle' as const },
      { at: 0, duration: entrance, frequency: 196, peak: 0.17, type: 'sine' as const },
      // One step per wash as they unfold across the screen.
      { at: 0.62, duration: entrance - 0.62, frequency: 246.94, peak: 0.15, type: 'sine' as const },
      { at: 1.1, duration: entrance - 1.1, frequency: 293.66, peak: 0.15, type: 'sine' as const },
      // 35%: the logo passes its resting size. The brightest note of the cue.
      { at: 1.54, duration: entrance - 1.54, frequency: 392, peak: 0.21, type: 'sine' as const },
      // The get-started button fades in.
      { at: 2.4, duration: entrance - 2.4, frequency: 493.88, peak: 0.12, type: 'sine' as const },
      // 65%: the motion settles, and the cue resolves onto the octave with it.
      { at: 2.86, duration: entrance - 2.86, frequency: 587.33, peak: 0.12, type: 'sine' as const },
    ];
    const cueLength = entrance;

    const schedule = () => {
      if (stopped) return;
      // Schedule against the clock as it reads once the context is running. A
      // context that starts suspended would otherwise have the whole cue timed
      // from a moment that has already passed by the time it resumes.
      const now = context.currentTime + 0.04;
      // Hold the master level flat and release only at the very end. Decaying it
      // across the cue is what silenced everything after the first two notes.
      master.gain.setValueAtTime(0.8, now);
      master.gain.setValueAtTime(0.8, now + cueLength - 0.45);
      master.gain.exponentialRampToValueAtTime(0.0001, now + cueLength);
      for (const note of notes) {
        const oscillator = context.createOscillator();
        const voiceGain = context.createGain();
        oscillator.type = note.type;
        oscillator.frequency.setValueAtTime(note.frequency, now + note.at);
        oscillator.detune.setValueAtTime(-7, now + note.at);
        // Each voice swells in the way the thing it stands for does, holds
        // while the motion continues, and lets go as the motion comes to rest.
        voiceGain.gain.setValueAtTime(0.0001, now + note.at);
        voiceGain.gain.exponentialRampToValueAtTime(note.peak, now + note.at + 0.24);
        voiceGain.gain.exponentialRampToValueAtTime(note.peak * 0.62, now + note.at + note.duration * 0.55);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.duration);
        oscillator.connect(voiceGain); voiceGain.connect(master);
        oscillator.start(now + note.at); oscillator.stop(now + note.at + note.duration + 0.05);
      }
      // Restart the authored entrance at playback, rather than measuring volume.
      surface.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 0; });
      timeout = window.setTimeout(stop, (cueLength + 0.6) * 1000);
    };

    void context.resume().then(schedule, schedule);
    return stop;
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
  const welcomeRef = useRef<HTMLElement>(null);
  const [shopName, setShopName] = useState('');
  const [template, setTemplate] = useState<'blank' | 'custom'>('blank');
  const [backupSchedule, setBackupSchedule] = useState<BackupSchedule>('daily');
  const [submitting, setSubmitting] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const [blueprint, setBlueprint] = useState<Blueprint>();
  const [blueprintError, setBlueprintError] = useState<string>();

  const applyBlueprintText = useCallback(async (text: string) => {
    try {
      setBlueprintError(undefined);
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
  }, []);

  // A blueprint can be dropped straight onto the setup screen, the same as onto
  // the running workspace, rather than having to be found through the picker.
  const dropOverlay = useBlueprintFileDrop({
    enabled: !showWelcome,
    locale,
    onFile: useCallback((text: string) => { void applyBlueprintText(text); }, [applyBlueprintText]),
  });

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await applyBlueprintText(await file.text());
    } catch {
      setBlueprintError(locale === 'ar' ? 'تعذر قراءة الملف.' : 'Could not read the file.');
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
    let stop: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      if (welcomeRef.current) stop = playWelcomeSound(welcomeRef.current);
    }, 320);
    return () => { window.clearTimeout(timer); stop?.(); };
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
        <main ref={welcomeRef} className="onboarding-welcome" aria-labelledby="welcome-to-max">
          <svg className="onboarding-welcome__colors" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true">
            <path className="onboarding-welcome__wash onboarding-welcome__wash--one" d="M-200-200H1400V80C1080-70 1060 300 760 190S570 400 270 290S-70 510-200 360Z" />
            <path className="onboarding-welcome__wash onboarding-welcome__wash--two" d="M-180 870C-80 530 120 720 280 440S570 100 810 310S1120 320 1400 140V1000Z" />
            <path className="onboarding-welcome__wash onboarding-welcome__wash--three" d="M-160 730C180 520 240 930 520 660S670 380 960 470S1140 600 1410 380V1060H-160Z" />
          </svg>
          <div className="onboarding-welcome__content">
            <h1 id="welcome-to-max" className="sr-only">Welcome to Max</h1>
            <img alt="" src={maxLogoReference} className="onboarding-welcome__logo" />
          </div>
          <button autoFocus aria-label="Get started" className="onboarding-welcome__button" onClick={() => setShowWelcome(false)} type="button"><ArrowRight aria-hidden="true" size={18} /></button>
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
                  <span className="language-item__monogram">EN</span>
                  <span className="language-item__identity"><span className="language-item__title" lang="en">English</span><span className="language-item__native">English</span></span>
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
                  <span className="language-item__monogram" lang="en">AR</span>
                  <span className="language-item__identity"><span className="language-item__title" lang="ar">العربية</span><span className="language-item__native">Arabic</span></span>
                  <span className="language-item__selection"><span className="language-item__meta" lang="ar">من اليمين لليسار</span>{locale === 'ar' && <Check aria-hidden="true" size={17} />}</span>
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
                {/* Confirm what the workspace will actually be built from, so an
                    imported blueprint is not silently summarised as blank. */}
                <div className="assembly-badge">
                  <CheckCircle2 aria-hidden="true" size={16} />
                  <span>
                    {template === 'custom' && blueprint
                      ? blueprint.name
                      : onboardingCopy(locale, 'blankTitle')}
                  </span>
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
      {dropOverlay}
    </div>
  );
}
