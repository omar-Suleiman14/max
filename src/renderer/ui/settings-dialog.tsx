import {
  Database,
  Download,
  Languages,
  Monitor,
  Moon,
  RotateCcw,
  Store,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

import type { BackupSchedule, ShopMetadata } from '../../shared/blueprint-contract';
import { type Locale, translate } from '../app/i18n';
import type { ThemePreference } from '../app/preferences';
import { BackupManager } from '../backup/backup-manager';
import { BlueprintDialog } from '../blueprints/blueprint-dialog';
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
  const [shopMetadata, setShopMetadata] = useState<ShopMetadata>();
  const [shopNameInput, setShopNameInput] = useState('');
  const [blueprintModalTab, setBlueprintModalTab] = useState<'export' | 'import'>();

  useEffect(() => {
    void window.maxApi.shop.getMetadata().then((data) => {
      setShopMetadata(data);
      setShopNameInput(data.shopName);
    });
  }, []);

  async function handleUpdateShopName() {
    if (!shopNameInput.trim()) return;
    const res = await window.maxApi.shop.updateMetadata({ shopName: shopNameInput.trim() });
    if (res.ok) {
      setShopMetadata(res.value);
    }
  }

  async function handleUpdateBackupSchedule(schedule: BackupSchedule) {
    const res = await window.maxApi.shop.updateMetadata({ backupSchedule: schedule });
    if (res.ok) {
      setShopMetadata(res.value);
    }
  }

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
    <>
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

        {/* SHOP SECTION */}
        <section className="settings-section" aria-labelledby="shop-settings-title">
          <div className="settings-section__heading">
            <h3 id="shop-settings-title">{translate(locale, 'shop')}</h3>
            <Store aria-hidden="true" size={17} />
          </div>

          <div className="field-pair">
            <label className="field" style={{ flex: 1 }}>
              <span>{translate(locale, 'shopName')}</span>
              <input
                maxLength={120}
                onBlur={() => void handleUpdateShopName()}
                onChange={(e) => setShopNameInput(e.target.value)}
                value={shopNameInput}
              />
            </label>
          </div>

          <div className="settings-blueprint-actions">
            <div>
              <strong>{translate(locale, 'blueprint')}</strong>
              {shopMetadata?.blueprintName && <small> · {shopMetadata.blueprintName}</small>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                icon={<Download aria-hidden="true" size={15} />}
                onClick={() => setBlueprintModalTab('export')}
              >
                {translate(locale, 'exportBlueprint')}
              </Button>
              <Button
                icon={<Upload aria-hidden="true" size={15} />}
                onClick={() => setBlueprintModalTab('import')}
              >
                {translate(locale, 'importBlueprint')}
              </Button>
            </div>
          </div>
        </section>

        {/* BACKUP SCHEDULE */}
        <section className="settings-section" aria-labelledby="backup-title">
          <div className="settings-section__heading">
            <h3 id="backup-title">{translate(locale, 'backupSchedule')}</h3>
            <Database aria-hidden="true" size={17} />
          </div>
          <div aria-label={translate(locale, 'backupSchedule')} className="choice-grid" role="radiogroup">
            <button
              aria-checked={shopMetadata?.backupSchedule === 'daily'}
              className="choice-card"
              data-selected={shopMetadata?.backupSchedule === 'daily'}
              onClick={() => void handleUpdateBackupSchedule('daily')}
              onKeyDown={moveRadio}
              role="radio"
              type="button"
            >
              <span>{translate(locale, 'backupDaily')}</span>
            </button>
            <button
              aria-checked={shopMetadata?.backupSchedule === 'weekly'}
              className="choice-card"
              data-selected={shopMetadata?.backupSchedule === 'weekly'}
              onClick={() => void handleUpdateBackupSchedule('weekly')}
              onKeyDown={moveRadio}
              role="radio"
              type="button"
            >
              <span>{translate(locale, 'backupWeekly')}</span>
            </button>
            <button
              aria-checked={shopMetadata?.backupSchedule === 'manual'}
              className="choice-card"
              data-selected={shopMetadata?.backupSchedule === 'manual'}
              onClick={() => void handleUpdateBackupSchedule('manual')}
              onKeyDown={moveRadio}
              role="radio"
              type="button"
            >
              <span>{translate(locale, 'backupManual')}</span>
            </button>
          </div>

          <div style={{ marginTop: '16px' }}>
            <BackupManager locale={locale} />
          </div>
        </section>

        {/* APPEARANCE */}
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

        {/* LANGUAGE */}
        <section className="settings-section" aria-labelledby="language-title">
          <div className="settings-section__heading">
            <h3 id="language-title">{translate(locale, 'language')}</h3>
            <Languages aria-hidden="true" size={17} />
          </div>
          <div aria-label={translate(locale, 'language')} className="choice-grid choice-grid--language" role="radiogroup">
            <button
              aria-checked={locale === 'en'}
              className="choice-card"
              data-selected={locale === 'en'}
              onClick={() => onChangeLocale('en')}
              onKeyDown={moveRadio}
              role="radio"
              type="button"
            >
              <span>English</span>
              <small>{translate(locale, 'direction')}</small>
            </button>
            <button
              aria-checked={locale === 'ar'}
              className="choice-card"
              data-selected={locale === 'ar'}
              onClick={() => onChangeLocale('ar')}
              onKeyDown={moveRadio}
              role="radio"
              type="button"
            >
              <span>العربية</span>
              <small>{translate(locale, 'rightToLeft')}</small>
            </button>
          </div>
        </section>

        {/* MOTION */}
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
          <Button onClick={onClose} variant="primary">
            {translate(locale, 'returnToWorkspace')}
          </Button>
        </footer>
      </FocusedOverlay>

      {blueprintModalTab && (
        <BlueprintDialog
          initialTab={blueprintModalTab}
          locale={locale}
          onClose={() => setBlueprintModalTab(undefined)}
          onImportSuccess={() => {
            void window.maxApi.shop.getMetadata().then(setShopMetadata);
          }}
        />
      )}
    </>
  );
}
