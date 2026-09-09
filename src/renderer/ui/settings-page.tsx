import { UpdateSettings } from './update-settings';
import { useWorkspaceDisplay } from '../pages/workspace-display-preferences';
import { AppearanceControls } from './appearance-controls';
import { Select } from './select';
import {

  Download,

  Monitor,
  Moon,

  Settings,

  Sun,

  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { BackupSchedule, ShopMetadata } from '../../shared/blueprint-contract';
import { type Locale, translate } from '../app/i18n';
import type { CustomPage, SettingsSectionId } from '../app/app-types';
import type { ThemePreference } from '../app/preferences';
import { BackupManager } from '../backup/backup-manager';
import { QuickActionSettings } from '../workflows/quick-action-settings';
import type { WorkspaceNode } from '../../shared/workspace-contract';
import { BlueprintDialog } from '../blueprints/blueprint-dialog';
import { loadTrashedPages, restoreTrashedPage } from '../pages/pages-store';
import { Button } from './button';
import { FocusedOverlay } from './focused-overlay';
import { readQuickActionsEnabled, saveQuickActionsEnabled } from '../workflows/quick-actions-preferences';

export type SettingsPageProps = Readonly<{
  activeSection?: SettingsSectionId;
  locale: Locale;
  onBackToApp: () => void;
  onChangeLocale: (locale: Locale) => void;
  onChangeTheme: (theme: ThemePreference) => void;
  onResetAppearance: () => void;
  onDemoDataSeeded: () => void;
  onVisibleSectionChange?: (section: SettingsSectionId) => void;
  onSectionChange: (section: SettingsSectionId) => void;
  onShowOnboarding: () => void;
  onWorkspaceDeleted: () => void;
  theme: ThemePreference;
}>;

const themes: readonly Readonly<{ icon: typeof Monitor; value: ThemePreference; label: 'dark' | 'light' | 'system' }>[] = [
  { icon: Monitor, label: 'system', value: 'system' },
  { icon: Moon, label: 'dark', value: 'dark' },
  { icon: Sun, label: 'light', value: 'light' },
];

export function SettingsPage({
  activeSection = 'settings-general',
  locale,
  onBackToApp,
  onChangeLocale,
  onChangeTheme,
  onVisibleSectionChange,
  onWorkspaceDeleted,
  theme,
}: SettingsPageProps) {
  useEffect(() => {
    const root = document.getElementById('main-content');
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) onVisibleSectionChange?.(visible[0].target.id as SettingsSectionId);
    }, { root, rootMargin: '-10% 0px -65% 0px' });
    document.querySelectorAll('.settings-scroll-section').forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onVisibleSectionChange]);
  const [graphEnabled, setGraphEnabled] = useWorkspaceDisplay('graph');
  const [connectionsEnabled, setConnectionsEnabled] = useWorkspaceDisplay('connections');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [confirmWorkspaceDelete, setConfirmWorkspaceDelete] = useState(false);
  const [trashTarget, setTrashTarget] = useState<{ id: string; title: string }>();
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dangerError, setDangerError] = useState<string>();
  const [shopMetadata, setShopMetadata] = useState<ShopMetadata>();
  const [shopNameInput, setShopNameInput] = useState('');
  const [blueprintModalTab, setBlueprintModalTab] = useState<'export' | 'import'>();
  const [restoringPage, setRestoringPage] = useState<string>();
  const [archiveError, setArchiveError] = useState<string>();
  const [trashedPages, setTrashedPages] = useState<readonly (CustomPage | WorkspaceNode)[]>([]);
  const [quickActionsEnabled, setQuickActionsEnabled] = useState(readQuickActionsEnabled);

  useEffect(() => {
    void window.maxApi.shop.getMetadata().then((data) => {
      setShopMetadata(data);
      setShopNameInput(data.shopName);
    });
    void loadTrashedPages().then(setTrashedPages);
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

  async function handleDeleteWorkspace() {
    if (deleting || deleteConfirmation !== (shopMetadata?.shopName || 'workspace')) return;
    setDeleting(true); setDangerError(undefined);
    try {
      const backup = await window.maxApi.backups.create('pre-delete');
      if (!backup.ok) throw new Error(backup.error.message);
      const reset = await window.maxApi.system.resetWorkspace();
      if (!reset.ok) throw new Error(reset.error.message);
      window.localStorage.clear();
      onWorkspaceDeleted();
    } catch (error) { setDangerError(error instanceof Error ? error.message : String(error)); }
    finally { setDeleting(false); }
  }

  const isRtl = locale === 'ar';

  return (
    <div className="apple-settings-wrapper notion-settings" data-section={activeSection}>
      <div className="settings-page-header" style={{ borderBottom: 'none', padding: '0 0 24px' }}>
        <div className="settings-page-header__main">
          <div className="settings-page-header__icon" style={{ background: 'transparent' }}>
            <Settings aria-hidden="true" size={32} />
          </div>
          <div>
            <h1 style={{ fontSize: '32px' }}>{translate(locale, 'settingsTitle')}</h1>
          </div>
        </div>
      </div>

      <div className="apple-settings-content">
        {/* General */}
        <h2 className="apple-settings-group-title">{locale === 'ar' ? 'عام' : 'Workspace'}</h2>
        <div className="apple-settings-group settings-scroll-section" id="settings-general">
          <div className="apple-settings-row">
            <div className="apple-settings-row-left">
              <div className="apple-settings-content">
                <span className="apple-settings-title">{locale === 'ar' ? 'اسم مساحة العمل' : 'Workspace name'}</span>
                <span className="apple-settings-description">{locale === 'ar' ? 'الاسم الظاهر أعلى مساحة العمل.' : 'The name shown at the top of your workspace.'}</span>
              </div>
            </div>
            <div className="apple-settings-row-right">
              <input
                className="apple-settings-input"
                aria-label={locale === 'ar' ? 'اسم مساحة العمل' : 'Workspace name'}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                maxLength={120}
                onBlur={() => void handleUpdateShopName()}
                onChange={(event) => setShopNameInput(event.target.value)}
                value={shopNameInput}
              />
            </div>
          </div>

          <div className="apple-settings-row">
            <div className="apple-settings-row-left">
              <div className="apple-settings-content">
                <span className="apple-settings-title">{translate(locale, 'language')}</span>
                <span className="apple-settings-description">{locale === 'ar' ? 'لغة واجهة المستخدم' : 'User interface language'}</span>
              </div>
            </div>
            <div className="apple-settings-row-right">
              <Select
                className="apple-settings-select"
                aria-label={translate(locale, 'language')}
                value={locale}
                onChange={(e) => onChangeLocale(e.target.value as Locale)}
              >
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </Select>
            </div>
          </div>

          <div className="apple-settings-row"><div className="apple-settings-row-left"><div className="apple-settings-content"><span className="apple-settings-title">{locale === 'ar' ? 'خريطة الصفحات' : 'Graph view'}</span><span className="apple-settings-description">{locale === 'ar' ? 'إظهار زر الخريطة وتفعيل اختصار لوحة المفاتيح.' : 'Show the graph button and enable its keyboard shortcut.'}</span></div></div><div className="apple-settings-row-right"><button type="button" className="settings-switch" role="switch" aria-label={locale === 'ar' ? 'خريطة الصفحات' : 'Graph view'} aria-checked={graphEnabled} data-checked={graphEnabled} onClick={() => setGraphEnabled(!graphEnabled)}><span aria-hidden="true" /></button></div></div>

          <div className="apple-settings-row"><div className="apple-settings-row-left"><div className="apple-settings-content"><span className="apple-settings-title">{locale === 'ar' ? 'روابط الصفحات' : 'Page connections'}</span><span className="apple-settings-description">{locale === 'ar' ? 'إظهار الروابط الواردة والصادرة أسفل الصفحات.' : 'Show backlinks and outgoing links below your pages.'}</span></div></div><div className="apple-settings-row-right"><button type="button" className="settings-switch" role="switch" aria-label={locale === 'ar' ? 'روابط الصفحات' : 'Page connections'} aria-checked={connectionsEnabled} data-checked={connectionsEnabled} onClick={() => setConnectionsEnabled(!connectionsEnabled)}><span aria-hidden="true" /></button></div></div>


        </div>

        {/* Workspace actions */}
        <h2 className="apple-settings-group-title">{locale === 'ar' ? 'الإجراءات السريعة' : 'Quick Actions'}</h2>
        <div className="apple-settings-group settings-scroll-section" id="settings-quick-actions">
          <div className="apple-settings-row quick-actions-toggle-row">
            <div className="apple-settings-row-left"><div className="apple-settings-content"><span className="apple-settings-title">{locale === 'ar' ? 'اختصار الإجراءات السريعة' : 'Quick action shortcut'}</span><span className="apple-settings-description">{locale === 'ar' ? 'أوقف الاختصار مع إبقاء الإجراءات محفوظة.' : 'Turn off the shortcut while keeping your actions saved.'}</span></div></div>
            <div className="apple-settings-row-right"><button type="button" className="settings-switch" role="switch" aria-label={locale === 'ar' ? 'الإجراءات السريعة' : 'Quick Actions'} aria-checked={quickActionsEnabled} data-checked={quickActionsEnabled} onClick={() => { setQuickActionsEnabled(!quickActionsEnabled); saveQuickActionsEnabled(!quickActionsEnabled); }}><span aria-hidden="true" /></button></div>
          </div>
          <fieldset className="quick-actions-editor-group" disabled={!quickActionsEnabled} inert={!quickActionsEnabled} aria-label={locale === 'ar' ? 'الإجراءات المحفوظة' : 'Saved actions'}>
            <QuickActionSettings locale={locale} />
          </fieldset>
        </div>

        {/* Appearance */}
        <h2 className="apple-settings-group-title">{translate(locale, 'appearance')}</h2>
        <div className="apple-settings-group settings-scroll-section" id="settings-appearance">
          <div className="apple-settings-row">
            <div className="apple-settings-row-left">
              <div className="apple-settings-content">
                <span className="apple-settings-title">{translate(locale, 'theme')}</span>
                <span className="apple-settings-description">{locale === 'ar' ? 'مظهر واجهة التطبيق' : 'Application interface theme'}</span>
              </div>
            </div>
            <div className="apple-settings-row-right">
              <div className="appearance-previews" role="radiogroup" aria-label={translate(locale, 'theme')}>
                {themes.map(({ value, label, icon: Icon }, index) => <button key={value} type="button" role="radio" aria-checked={theme === value} tabIndex={theme === value ? 0 : -1} className="appearance-preview" data-theme-preview={value} onClick={() => onChangeTheme(value)} onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const step = event.key === 'ArrowUp' || event.key === (isRtl ? 'ArrowRight' : 'ArrowLeft') ? -1 : 1;
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? themes.length - 1 : (index + step + themes.length) % themes.length;
                  onChangeTheme(themes[next]!.value);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
                }}><span className="appearance-preview-window" aria-hidden="true"><i><em /><em /><em /></i><span><b /><b /><b /><em className="preview-composer" /></span><em className="preview-popup"><b /><b /><b /></em></span><span className="appearance-preview-label"><Icon size={14} />{translate(locale, label)}</span></button>)}
              </div>
            </div>
          </div>
          <AppearanceControls locale={locale} />
        </div>

        {/* Backup */}
        <h2 className="apple-settings-group-title">{locale === 'ar' ? 'النسخ الاحتياطي' : 'Backup'}</h2>
        <div className="apple-settings-group settings-scroll-section" id="settings-backup">

          <div className="apple-settings-row">
            <div className="apple-settings-row-left">
              <div className="apple-settings-content">
                <span className="apple-settings-title">{translate(locale, 'backupSchedule')}</span>
                <span className="apple-settings-description">{locale === 'ar' ? 'تكرار النسخ الاحتياطي التلقائي' : 'Automatic backup frequency'}</span>
              </div>
            </div>
            <div className="apple-settings-row-right">
              <Select
                className="apple-settings-select"
                value={shopMetadata?.backupSchedule || 'manual'}
                onChange={(e) => void handleUpdateBackupSchedule(e.target.value as BackupSchedule)}
              >
                <option value="daily">{translate(locale, 'backupDaily')}</option>
                <option value="weekly">{translate(locale, 'backupWeekly')}</option>
                <option value="manual">{translate(locale, 'backupManual')}</option>
              </Select>
            </div>
          </div>

          <div className="settings-backup-content">
            <BackupManager locale={locale} />
          </div>
        </div>

        <h2 className="apple-settings-group-title" id="archive-settings-title">{locale === 'ar' ? 'الأرشيف والمهملات' : 'Archive & trash'}</h2>
        <section className="settings-scroll-section archive-settings-card" id="settings-archive" tabIndex={-1} aria-labelledby="archive-settings-title">
          {archiveError && <p className="form-error" role="alert">{archiveError}</p>}
          {trashedPages.length === 0 ? <div className="archive-settings-empty"><span aria-hidden="true">✓</span><div><strong>{locale === 'ar' ? 'المهملات فارغة' : 'Trash is empty'}</strong><p>{locale === 'ar' ? 'ستظهر الصفحات المؤرشفة هنا.' : 'Archived pages will appear here.'}</p></div></div> : <details className="backup-history-disclosure"><summary>{locale === 'ar' ? 'الصفحات المؤرشفة' : 'Archived pages'} <span>{trashedPages.length}</span></summary>{trashedPages.map((item) => <div className="archive-settings-item" key={item.id}><span>{item.title || (locale === 'ar' ? 'بدون عنوان' : 'Untitled')}</span><Button disabled={!!restoringPage} onClick={() => {
            setRestoringPage(item.id); setArchiveError(undefined);
            void restoreTrashedPage(item.id).then(async (restored) => {
              if (!restored) throw new Error(locale === 'ar' ? 'تعذرت الاستعادة' : 'Could not restore this page');
              setTrashedPages(await loadTrashedPages()); window.dispatchEvent(new Event('max:workspace-changed'));
            }).catch((error: unknown) => setArchiveError(String(error))).finally(() => setRestoringPage(undefined));
          }}>{locale === 'ar' ? 'استعادة' : 'Restore'}</Button><Button disabled={!!restoringPage || purging} variant="ghost" onClick={() => { setPurgeError(''); setTrashTarget({ id: item.id, title: item.title }); }}>{locale === 'ar' ? 'حذف نهائي' : 'Delete permanently'}</Button></div>)}</details>}
        </section>
      </div>

      <h2 className="apple-settings-group-title" id="settings-danger-title">{locale === 'ar' ? 'خطر' : 'Danger'}</h2>
      <section className="settings-scroll-section" id="settings-danger" aria-labelledby="settings-danger-title">
          <UpdateSettings locale={locale} />
          <div className="apple-settings-row">
            <div className="apple-settings-row-left">
              <div className="apple-settings-content">
                <span className="apple-settings-title">{translate(locale, 'blueprint')}</span>
                <span className="apple-settings-description">{locale === 'ar' ? 'استيراد أو تصدير مخطط المتجر' : 'Import or export workspace structure and records'}</span>
              </div>
            </div>
            <div className="apple-settings-row-right">
              <Button icon={<Download aria-hidden="true" size={15} />} onClick={() => setBlueprintModalTab('export')} variant="ghost">{translate(locale, 'exportBlueprint')}</Button>
              <Button icon={<Upload aria-hidden="true" size={15} />} onClick={() => setBlueprintModalTab('import')} variant="ghost">{translate(locale, 'importBlueprint')}</Button>
            </div>
          </div>
        <div className="apple-settings-row">
          <div className="apple-settings-row-left"><div className="apple-settings-content">
            <span className="apple-settings-title" style={{ color: 'var(--danger)' }}>{locale === 'ar' ? 'حذف مساحة العمل' : 'Delete workspace'}</span>
            <span className="apple-settings-description">{locale === 'ar' ? 'حذف جميع الصفحات وقواعد البيانات في مساحة العمل.' : 'Remove all pages and databases in this workspace.'}</span>
          </div></div>
          <div className="apple-settings-row-right" style={{ display: 'flex', gap: 8 }}>
            <Button disabled={deleting} onClick={() => { setDeleteConfirmation(''); setDangerError(undefined); setConfirmWorkspaceDelete(true); }} variant="consequential">{locale === 'ar' ? 'حذف مساحة العمل' : 'Delete workspace'}</Button>
          </div>
        </div>
        {dangerError && <p className="form-error" role="alert">{dangerError}</p>}
      </section>
      {trashTarget && <FocusedOverlay className="settings-delete-dialog" labelId="trash-delete-title" onClose={() => { if (!purging) setTrashTarget(undefined); }}>
        <h3 id="trash-delete-title">{locale === 'ar' ? 'حذف نهائي؟' : 'Delete permanently?'}</h3>
        <p><bdi>{trashTarget.title}</bdi><br />{locale === 'ar' ? 'سيتم حذف هذا العنصر ومحتوياته نهائيًا. لا يمكن التراجع.' : 'This item and its contents will be permanently deleted. This cannot be undone.'}</p>
        {purgeError && <p role="alert">{purgeError}</p>}
        <button className="settings-delete-confirm" type="button" disabled={purging} onClick={() => { if (purging) return; setPurging(true); setPurgeError(''); void window.maxApi.workspace.permanentlyDeleteNode(trashTarget.id).then(async (result) => { if (!result.ok) { setPurgeError(result.error.message); return; } setTrashedPages(await loadTrashedPages()); setTrashTarget(undefined); window.dispatchEvent(new Event('max:workspace-changed')); }).catch(() => setPurgeError(locale === 'ar' ? 'تعذر حذف العنصر.' : 'Could not permanently delete this item.')).finally(() => setPurging(false)); }}>{locale === 'ar' ? 'حذف نهائي' : 'Delete permanently'}</button>
        <button data-autofocus="true" type="button" disabled={purging} onClick={() => setTrashTarget(undefined)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      </FocusedOverlay>}
      {confirmWorkspaceDelete && <FocusedOverlay className="settings-delete-dialog" labelId="workspace-delete-title" onClose={() => { if (!deleting) setConfirmWorkspaceDelete(false); }}>
        <h3 id="workspace-delete-title">{locale === 'ar' ? 'حذف مساحة العمل؟' : 'Delete workspace?'}</h3>
        <p>{locale === 'ar' ? 'اكتب اسم مساحة العمل للتأكيد. سيتم إنشاء نسخة احتياطية قبل الحذف.' : 'Type the workspace name to confirm. A safety backup is created before deletion.'}</p>
        <input data-autofocus="true" aria-label={locale === 'ar' ? 'اسم مساحة العمل للتأكيد' : 'Workspace name to confirm deletion'} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={shopMetadata?.shopName || 'workspace'} />
        {dangerError && <p role="alert">{dangerError}</p>}
        <button className="settings-delete-confirm" type="button" disabled={deleting || deleteConfirmation !== (shopMetadata?.shopName || 'workspace')} onClick={() => void handleDeleteWorkspace()}>{locale === 'ar' ? 'حذف مساحة العمل' : 'Delete workspace'}</button>
        <button type="button" disabled={deleting} onClick={() => setConfirmWorkspaceDelete(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      </FocusedOverlay>}
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
