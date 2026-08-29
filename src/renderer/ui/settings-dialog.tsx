import { Languages, Monitor, Moon, RotateCcw, Sun, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { type Locale, translate } from '../app/i18n';
import type { ThemePreference } from '../app/preferences';
import { Button } from './button';
import { FocusedOverlay } from './focused-overlay';

type SettingsDialogProps = Readonly<{
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
  onChangeTheme: (theme: ThemePreference) => void;
  onClose: () => void;
  onResetAppearance: () => void;
  theme: ThemePreference;
}>;

const themes: readonly Readonly<{ icon: typeof Monitor; value: ThemePreference; label: 'dark' | 'light' | 'system' }>[] = [
  { icon: Monitor, label: 'system', value: 'system' },
  { icon: Sun, label: 'light', value: 'light' },
  { icon: Moon, label: 'dark', value: 'dark' },
];

export function SettingsDialog({
  locale,
  onChangeLocale,
  onChangeTheme,
  onClose,
  onResetAppearance,
  theme,
}: SettingsDialogProps) {
  function moveRadio(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home'].includes(event.key)) return;
    const radios = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const currentIndex = radios.indexOf(event.currentTarget);
    if (currentIndex < 0 || radios.length === 0) return;
    const lastIndex = radios.length - 1;
    const rightToLeft = document.documentElement.dir === 'rtl';
    const movesForward =
      event.key === 'ArrowDown' ||
      (rightToLeft ? event.key === 'ArrowLeft' : event.key === 'ArrowRight');
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    else if (movesForward) nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    else nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    event.preventDefault();
    radios[nextIndex]?.focus();
    radios[nextIndex]?.click();
  }

  return (
    <FocusedOverlay className="settings-dialog" labelId="settings-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">{translate(locale, 'settings')}</p>
          <h2 id="settings-title">{translate(locale, 'settingsTitle')}</h2>
          <p>{translate(locale, 'settingsDescription')}</p>
        </div>
        <button aria-label={translate(locale, 'close')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <section className="settings-section" aria-labelledby="appearance-title">
        <div className="settings-section__heading">
          <h3 id="appearance-title">{translate(locale, 'appearance')}</h3>
          <span>{translate(locale, 'theme')}</span>
        </div>
        <div aria-label={translate(locale, 'theme')} className="choice-grid" role="radiogroup">
          {themes.map(({ icon: Icon, label, value }) => (
            <button
              key={value}
              aria-checked={theme === value}
              className="choice-card"
              data-selected={theme === value}
              onClick={() => onChangeTheme(value)}
              onKeyDown={moveRadio}
              role="radio"
              type="button"
            >
              <Icon aria-hidden="true" size={19} />
              <span>{translate(locale, label)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="language-title">
        <div className="settings-section__heading">
          <h3 id="language-title">{translate(locale, 'language')}</h3>
          <Languages aria-hidden="true" size={17} />
        </div>
        <div aria-label={translate(locale, 'language')} className="choice-grid choice-grid--language" role="radiogroup">
          <button aria-checked={locale === 'en'} className="choice-card" data-selected={locale === 'en'} onClick={() => onChangeLocale('en')} onKeyDown={moveRadio} role="radio" type="button">
            <span>English</span>
            <small>{translate(locale, 'direction')}</small>
          </button>
          <button aria-checked={locale === 'ar'} className="choice-card" data-selected={locale === 'ar'} onClick={() => onChangeLocale('ar')} onKeyDown={moveRadio} role="radio" type="button">
            <span>العربية</span>
            <small>{translate(locale, 'rightToLeft')}</small>
          </button>
        </div>
      </section>

      <section className="settings-section settings-section--motion" aria-labelledby="motion-title">
        <div>
          <h3 id="motion-title">{translate(locale, 'motion')}</h3>
          <p>{translate(locale, 'motionBody')}</p>
        </div>
      </section>

      <footer className="dialog-footer">
        <Button icon={<RotateCcw aria-hidden="true" size={17} />} onClick={onResetAppearance} variant="consequential">
          {translate(locale, 'preferencesReset')}
        </Button>
        <Button data-autofocus="true" onClick={onClose} variant="primary">{translate(locale, 'returnToWorkspace')}</Button>
      </footer>
    </FocusedOverlay>
  );
}
