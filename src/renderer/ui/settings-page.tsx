import {
  Archive,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Database,
  Download,
  Eye,
  Languages,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Settings,
  Sparkles,
  Store,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

import type { BackupSchedule, ShopMetadata } from '../../shared/blueprint-contract';
import { type Locale, translate } from '../app/i18n';
import type { SettingsSectionId } from '../app/app-types';
import type { ThemePreference } from '../app/preferences';
import { BackupManager } from '../backup/backup-manager';
import { BlueprintDialog } from '../blueprints/blueprint-dialog';
import { emptyPageTrash, loadTrashedPages, restoreTrashedPage } from '../pages/pages-store';
import { Button } from './button';

export type SettingsPageProps = Readonly<{
  locale: Locale;
  onBackToApp: () => void;
  onChangeLocale: (locale: Locale) => void;
  onChangeTheme: (theme: ThemePreference) => void;
  onResetAppearance: () => void;
  onDemoDataSeeded: () => void;
  onSectionChange: (section: SettingsSectionId) => void;
  onShowOnboarding: () => void;
  onWorkspaceDeleted: () => void;
  theme: ThemePreference;
}>;

const themes: readonly Readonly<{ icon: typeof Monitor; value: ThemePreference; label: 'dark' | 'light' | 'system' }>[] = [
  { icon: Monitor, label: 'system', value: 'system' },
  { icon: Sun, label: 'light', value: 'light' },
  { icon: Moon, label: 'dark', value: 'dark' },
];

export function SettingsPage({
  locale,
  onBackToApp,
  onChangeLocale,
  onChangeTheme,
  onResetAppearance,
  onDemoDataSeeded,
  onSectionChange,
  onShowOnboarding,
  onWorkspaceDeleted,
  theme,
}: SettingsPageProps) {
  const [shopMetadata, setShopMetadata] = useState<ShopMetadata>();
  const [shopNameInput, setShopNameInput] = useState('');
  const [blueprintModalTab, setBlueprintModalTab] = useState<'export' | 'import'>();
  const [trashedPages, setTrashedPages] = useState(loadTrashedPages);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dangerError, setDangerError] = useState<string>();
  const [demoState, setDemoState] = useState<'idle' | 'loading' | 'added' | 'exists' | 'error'>('idle');

  useEffect(() => {
    void window.maxApi.shop.getMetadata().then((data) => {
      setShopMetadata(data);
      setShopNameInput(data.shopName);
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        if (document.querySelector('.overlay')) return;
        onBackToApp();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBackToApp]);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const sectionIds = ['settings-general', 'settings-appearance', 'settings-backup', 'settings-archive'];
    const root = document.querySelector<HTMLElement>('.content[data-page="settings"]');
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) onSectionChange(visible[0].target.id as SettingsSectionId);
    }, { root, rootMargin: '-72px 0px -62% 0px', threshold: [0, 0.15] });
    sectionIds.forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [onSectionChange]);

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

  async function handleSeedDemoData() {
    setDemoState('loading');
    const result = await window.maxApi.shop.seedDemoData(locale);
    if (!result.ok) {
      setDemoState('error');
      return;
    }
    const added = Object.values(result.value).some((count) => count > 0);
    setDemoState(added ? 'added' : 'exists');
    if (added) onDemoDataSeeded();
  }

  async function handleDeleteWorkspace() {
    const expected = shopMetadata?.shopName || (locale === 'ar' ? 'مساحة العمل' : 'workspace');
    if (deleteConfirmation !== expected) return;
    setDeleting(true);
    setDangerError(undefined);
    const backup = await window.maxApi.backups.create('pre-delete');
    if (!backup.ok) {
      setDangerError(locale === 'ar' ? 'تعذر إنشاء نسخة الأمان. لم يتم حذف أي شيء.' : 'The safety backup failed. Nothing was deleted.');
      setDeleting(false);
      return;
    }
    const reset = await window.maxApi.system.resetWorkspace();
    if (!reset.ok) {
      setDangerError(locale === 'ar' ? 'تعذر حذف مساحة العمل. نسخة الأمان محفوظة.' : 'Workspace deletion failed. The safety backup is preserved.');
      setDeleting(false);
      return;
    }
    window.localStorage.clear();
    onWorkspaceDeleted();
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

  const isRtl = locale === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  return (
    <div className="settings-page-wrapper">
      <div className="settings-page-header">
        <div className="settings-page-header__main">
          <div className="settings-page-header__icon">
            <Settings aria-hidden="true" size={24} />
          </div>
          <div>
            <h1>{translate(locale, 'settingsTitle')}</h1>
            <p>{translate(locale, 'settingsDescription')}</p>
          </div>
        </div>
        <Button
          icon={<BackIcon aria-hidden="true" size={16} />}
          onClick={onBackToApp}
          variant="secondary"
        >
          {translate(locale, 'backToApp')}
        </Button>
      </div>

      <div className="settings-page-content">
          <section className="settings-section settings-scroll-section" id="settings-general" tabIndex={-1} aria-labelledby="settings-general-title">
            <div className="settings-section__intro">
              <Store aria-hidden="true" size={19} />
              <div><h2 id="settings-general-title">{locale === 'ar' ? 'عام' : 'General'}</h2><p>{locale === 'ar' ? 'هوية مساحة العمل وإعدادها وبيانات العرض.' : 'Workspace identity, setup, and demo data.'}</p></div>
            </div>

            <div className="settings-control-row settings-control-row--field">
              <div className="settings-control-copy"><strong>{translate(locale, 'shopName')}</strong><small>{locale === 'ar' ? 'الاسم الظاهر أعلى مساحة العمل.' : 'The name shown at the top of your workspace.'}</small></div>
              <label className="field settings-inline-field">
                <span className="sr-only">{translate(locale, 'shopName')}</span>
                <input maxLength={120} onBlur={() => void handleUpdateShopName()} onChange={(event) => setShopNameInput(event.target.value)} value={shopNameInput} />
              </label>
            </div>

            <div className="settings-control-row">
              <div className="settings-control-copy"><strong>{translate(locale, 'blueprint')}</strong><small>{shopMetadata?.blueprintName || (locale === 'ar' ? 'استورد هيكل متجر أو صدّر الهيكل الحالي.' : 'Import a shop structure or export the current one.')}</small></div>
              <div className="settings-row-actions">
                <Button icon={<Download aria-hidden="true" size={15} />} onClick={() => setBlueprintModalTab('export')}>{translate(locale, 'exportBlueprint')}</Button>
                <Button icon={<Upload aria-hidden="true" size={15} />} onClick={() => setBlueprintModalTab('import')}>{translate(locale, 'importBlueprint')}</Button>
              </div>
            </div>

            <div className="settings-control-row">
              <div className="settings-control-copy">
                <strong>{locale === 'ar' ? 'بيانات العرض' : 'Demo workspace'}</strong>
                <small>{locale === 'ar' ? 'حسابات وأصناف وعملاء ومعاملات وصفحات جاهزة للعرض، دون حذف بياناتك.' : 'Presentation-ready accounts, items, people, transactions, and pages—without deleting your data.'}</small>
                {demoState === 'added' && <p className="form-success" role="status">{locale === 'ar' ? 'تمت إضافة بيانات العرض.' : 'Demo data added.'}</p>}
                {demoState === 'exists' && <p className="settings-muted" role="status">{locale === 'ar' ? 'بيانات العرض موجودة بالفعل.' : 'Demo data is already present.'}</p>}
                {demoState === 'error' && <p className="form-error" role="alert">{locale === 'ar' ? 'تعذرت إضافة بيانات العرض.' : 'Demo data could not be added.'}</p>}
              </div>
              <Button disabled={demoState === 'loading' || demoState === 'added' || demoState === 'exists'} icon={<Sparkles aria-hidden="true" size={15} />} onClick={() => void handleSeedDemoData()}>
                {demoState === 'loading' ? (locale === 'ar' ? 'جارٍ الإضافة…' : 'Adding…') : (locale === 'ar' ? 'إضافة بيانات العرض' : 'Add demo data')}
              </Button>
            </div>

            <div className="settings-control-row">
              <div className="settings-control-copy"><strong>{locale === 'ar' ? 'جولة الإعداد' : 'Onboarding tour'}</strong><small>{locale === 'ar' ? 'شاهد خطوات الإعداد مرة أخرى دون تغيير البيانات.' : 'Preview setup again without changing workspace data.'}</small></div>
              <Button icon={<Eye aria-hidden="true" size={16} />} onClick={onShowOnboarding}>{locale === 'ar' ? 'عرض الجولة' : 'View tour'}</Button>
            </div>
          </section>

          <section className="settings-section settings-scroll-section" id="settings-appearance" tabIndex={-1} aria-labelledby="settings-appearance-title">
            <div className="settings-section__intro">
              <Palette aria-hidden="true" size={19} />
              <div><h2 id="settings-appearance-title">{translate(locale, 'appearance')}</h2><p>{locale === 'ar' ? 'اضبط المظهر واللغة بما يناسب طريقة عملك.' : 'Tune the interface and language to fit how you work.'}</p></div>
            </div>

            <div className="settings-control-stack">
              <div className="settings-control-copy"><strong>{translate(locale, 'theme')}</strong><small>{locale === 'ar' ? 'استخدم مظهر النظام أو اختر المظهر يدويًا.' : 'Follow your system or choose a theme manually.'}</small></div>
              <div aria-label={translate(locale, 'theme')} className="choice-grid" role="radiogroup">
                {themes.map(({ icon: Icon, label, value }) => (
                  <button key={value} aria-checked={theme === value} className="choice-card" data-selected={theme === value} onClick={() => onChangeTheme(value)} onKeyDown={moveRadio} role="radio" type="button">
                    <Icon aria-hidden="true" size={17} /><span>{translate(locale, label)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-control-stack">
              <div className="settings-control-copy"><strong>{translate(locale, 'language')}</strong><small>{locale === 'ar' ? 'يتغير اتجاه الواجهة تلقائيًا مع اللغة.' : 'Interface direction follows the selected language.'}</small></div>
              <div aria-label={translate(locale, 'language')} className="choice-grid choice-grid--language" role="radiogroup">
                <button aria-checked={locale === 'en'} className="choice-card" data-selected={locale === 'en'} onClick={() => onChangeLocale('en')} onKeyDown={moveRadio} role="radio" type="button"><Languages aria-hidden="true" size={17} /><span>English</span><small>Left to right</small></button>
                <button aria-checked={locale === 'ar'} className="choice-card" data-selected={locale === 'ar'} onClick={() => onChangeLocale('ar')} onKeyDown={moveRadio} role="radio" type="button"><Languages aria-hidden="true" size={17} /><span>العربية</span><small>من اليمين إلى اليسار</small></button>
              </div>
            </div>

            <div className="settings-control-row">
              <div className="settings-control-copy"><strong>{translate(locale, 'motion')}</strong><small>{translate(locale, 'motionBody')}</small></div>
              <Button icon={<RotateCcw aria-hidden="true" size={16} />} onClick={onResetAppearance}>{translate(locale, 'preferencesReset')}</Button>
            </div>
          </section>

          <section className="settings-section settings-scroll-section" id="settings-backup" tabIndex={-1} aria-labelledby="settings-backup-title">
            <div className="settings-section__intro">
              <Database aria-hidden="true" size={19} />
              <div><h2 id="settings-backup-title">{locale === 'ar' ? 'النسخ الاحتياطي' : 'Backup'}</h2><p>{locale === 'ar' ? 'نسخ محلية يمكنك فحصها واستعادتها دون اتصال بالإنترنت.' : 'Local copies you can verify and restore without an internet connection.'}</p></div>
            </div>

            <div className="settings-control-stack">
              <div className="settings-control-copy"><strong>{translate(locale, 'backupSchedule')}</strong><small>{locale === 'ar' ? 'اختر عدد مرات إنشاء النسخ التلقائية.' : 'Choose how often automatic local copies are created.'}</small></div>
              <div aria-label={translate(locale, 'backupSchedule')} className="choice-grid" role="radiogroup">
                {(['daily', 'weekly', 'manual'] as const).map((schedule) => (
                  <button key={schedule} aria-checked={shopMetadata?.backupSchedule === schedule} className="choice-card" data-selected={shopMetadata?.backupSchedule === schedule} onClick={() => void handleUpdateBackupSchedule(schedule)} onKeyDown={moveRadio} role="radio" type="button">
                    <span>{translate(locale, schedule === 'daily' ? 'backupDaily' : schedule === 'weekly' ? 'backupWeekly' : 'backupManual')}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-backup-manager"><BackupManager locale={locale} /></div>
          </section>

          <section className="settings-section settings-scroll-section" id="settings-archive" tabIndex={-1} aria-labelledby="settings-archive-title">
            <div className="settings-section__intro">
              <Archive aria-hidden="true" size={19} />
              <div><h2 id="settings-archive-title">{locale === 'ar' ? 'الأرشيف والمهملات' : 'Archive & trash'}</h2><p>{locale === 'ar' ? 'استعد الصفحات المحذوفة أو نظّف مساحة العمل بأمان.' : 'Recover removed pages or safely clean up the workspace.'}</p></div>
            </div>

            <div className="settings-control-stack">
              <div className="settings-control-copy"><strong>{locale === 'ar' ? 'المهملات' : 'Trash'}</strong><small>{locale === 'ar' ? 'تبقى الصفحات هنا إلى أن تستعيدها أو تفرغ المهملات.' : 'Pages stay here until you restore them or empty the trash.'}</small></div>
              {trashedPages.length === 0 ? <div className="settings-empty-row"><Trash2 aria-hidden="true" size={17} /><span>{locale === 'ar' ? 'المهملات فارغة' : 'Trash is empty'}</span></div> : <div className="settings-trash-list">{trashedPages.map((trashedPage) => <div key={trashedPage.id}><span>{trashedPage.title || (locale === 'ar' ? 'صفحة بدون عنوان' : 'Untitled page')}</span><Button onClick={() => { restoreTrashedPage(trashedPage.id); setTrashedPages(loadTrashedPages()); }}>{locale === 'ar' ? 'استعادة' : 'Restore'}</Button></div>)}</div>}
              {trashedPages.length > 0 && <Button onClick={() => { emptyPageTrash(); setTrashedPages([]); }} variant="consequential">{locale === 'ar' ? 'إفراغ المهملات' : 'Empty trash'}</Button>}
            </div>

            <div className="settings-danger-zone">
              <div className="settings-control-copy"><strong><AlertTriangle aria-hidden="true" size={15} />{locale === 'ar' ? 'حذف مساحة العمل' : 'Delete workspace'}</strong><small>{locale === 'ar' ? 'ينشئ Max نسخة أمان أولًا، ثم يحذف البيانات المحلية ويعيد شاشة الإعداد.' : 'Max creates a safety backup first, then removes local workspace data and returns to setup.'}</small></div>
              <label className="field"><span>{locale === 'ar' ? `اكتب "${shopMetadata?.shopName || 'مساحة العمل'}" للتأكيد` : `Type "${shopMetadata?.shopName || 'workspace'}" to confirm`}</span><input onChange={(event) => setDeleteConfirmation(event.target.value)} value={deleteConfirmation} /></label>
              {dangerError && <p className="form-error" role="alert">{dangerError}</p>}
              <Button disabled={deleting || deleteConfirmation !== (shopMetadata?.shopName || (locale === 'ar' ? 'مساحة العمل' : 'workspace'))} icon={<Trash2 aria-hidden="true" size={16} />} onClick={() => void handleDeleteWorkspace()} variant="consequential">{deleting ? (locale === 'ar' ? 'جارٍ إنشاء النسخة والحذف…' : 'Backing up and deleting…') : (locale === 'ar' ? 'حذف مساحة العمل' : 'Delete workspace')}</Button>
            </div>
          </section>
      </div>

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
    </div>
  );
}
