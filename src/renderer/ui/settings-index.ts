import type { SettingsSectionId } from '../app/app-types';
import type { Locale } from '../app/i18n';

/**
 * Every setting the sidebar's search box can find.
 *
 * Searching used to filter the six section names, which meant typing the name
 * of an actual setting found nothing. The entries here are the settings
 * themselves: each one names the section it lives in and the `data-setting`
 * attribute on its row, so choosing a result can open that section and scroll
 * the row into view.
 *
 * Keep this list beside the rows it describes: a new row in the settings page
 * wants an entry here and a matching `data-setting` attribute.
 */
export type SettingsEntry = Readonly<{
  /** Matches `data-setting` on the row, and is unique across the page. */
  id: string;
  keywords: readonly string[];
  keywordsAr?: readonly string[];
  label: string;
  labelAr: string;
  section: SettingsSectionId;
}>;

export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  { id: 'workspace-name', keywords: ['workspace', 'name', 'rename', 'title'], keywordsAr: ['مساحة', 'اسم'], label: 'Workspace name', labelAr: 'اسم مساحة العمل', section: 'settings-general' },
  { id: 'language', keywords: ['language', 'arabic', 'english', 'locale', 'translation'], keywordsAr: ['لغة', 'عربية', 'إنجليزية'], label: 'Language', labelAr: 'اللغة', section: 'settings-general' },
  { id: 'graph', keywords: ['graph', 'map', 'pages', 'view'], keywordsAr: ['خريطة', 'رسم'], label: 'Graph view', labelAr: 'خريطة الصفحات', section: 'settings-general' },
  { id: 'connections', keywords: ['connections', 'backlinks', 'links', 'related'], keywordsAr: ['روابط', 'صلات'], label: 'Page connections', labelAr: 'روابط الصفحات', section: 'settings-general' },
  { id: 'quick-actions', keywords: ['quick', 'actions', 'shortcut', 'keyboard', 'command'], keywordsAr: ['إجراءات', 'سريعة', 'اختصار'], label: 'Quick action shortcut', labelAr: 'اختصار الإجراءات السريعة', section: 'settings-quick-actions' },
  { id: 'quick-action-list', keywords: ['saved', 'actions', 'forms', 'fields'], keywordsAr: ['إجراءات', 'محفوظة'], label: 'Saved actions', labelAr: 'الإجراءات المحفوظة', section: 'settings-quick-actions' },
  { id: 'theme', keywords: ['theme', 'dark', 'light', 'system', 'appearance', 'colour', 'color'], keywordsAr: ['مظهر', 'داكن', 'فاتح'], label: 'Theme', labelAr: 'السمة', section: 'settings-appearance' },
  { id: 'appearance-contrast', keywords: ['contrast', 'borders', 'colour', 'color'], keywordsAr: ['تباين'], label: 'Contrast', labelAr: 'التباين', section: 'settings-appearance' },
  { id: 'appearance-glass', keywords: ['glass', 'opacity', 'blur', 'transparency', 'menus'], keywordsAr: ['زجاج', 'عتامة'], label: 'Glass opacity', labelAr: 'عتامة الزجاج', section: 'settings-appearance' },
  { id: 'appearance-motion', keywords: ['animation', 'motion', 'speed', 'panels'], keywordsAr: ['حركة', 'سرعة'], label: 'Panel animations', labelAr: 'حركة النوافذ', section: 'settings-appearance' },
  { id: 'backup-schedule', keywords: ['backup', 'schedule', 'daily', 'weekly', 'automatic'], keywordsAr: ['نسخ', 'احتياطي', 'جدولة'], label: 'Backup schedule', labelAr: 'جدولة النسخ الاحتياطي', section: 'settings-backup' },
  { id: 'local-backups', keywords: ['backup', 'restore', 'local', 'export', 'file'], keywordsAr: ['نسخ', 'استعادة', 'محلي'], label: 'Local backups', labelAr: 'النسخ المحلية', section: 'settings-backup' },
  { id: 'cloud-backup', keywords: ['cloud', 'backup', 'sync', 'sign in', 'account', 'online'], keywordsAr: ['سحابة', 'مزامنة', 'حساب'], label: 'Max Cloud Backup', labelAr: 'نسخ Max السحابي', section: 'settings-backup' },
  { id: 'archive', keywords: ['archive', 'trash', 'deleted', 'restore', 'bin'], keywordsAr: ['أرشيف', 'مهملات', 'استعادة'], label: 'Archive & trash', labelAr: 'الأرشيف والمهملات', section: 'settings-archive' },
  { id: 'updates', keywords: ['update', 'version', 'release', 'download', 'install'], keywordsAr: ['تحديث', 'إصدار'], label: 'Max updates', labelAr: 'تحديثات Max', section: 'settings-danger' },
  { id: 'blueprint', keywords: ['blueprint', 'import', 'export', 'template', 'structure'], keywordsAr: ['مخطط', 'استيراد', 'تصدير'], label: 'Blueprint', labelAr: 'المخطط', section: 'settings-danger' },
  { id: 'delete-workspace', keywords: ['delete', 'reset', 'erase', 'remove', 'workspace'], keywordsAr: ['حذف', 'إعادة'], label: 'Delete workspace', labelAr: 'حذف مساحة العمل', section: 'settings-danger' },
];

export function settingsEntryLabel(entry: SettingsEntry, locale: Locale): string {
  return locale === 'ar' ? entry.labelAr : entry.label;
}

/**
 * Settings matching a query, best first.
 *
 * A label that starts with the query outranks one that merely contains it, and
 * a keyword match comes last, so typing "back" lands on the backup rows rather
 * than on whatever else happens to mention a backup.
 */
export function searchSettings(query: string, locale: Locale): readonly SettingsEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored: { entry: SettingsEntry; score: number }[] = [];
  for (const entry of SETTINGS_ENTRIES) {
    const labels = [entry.label.toLowerCase(), entry.labelAr.toLowerCase()];
    const keywords = [...entry.keywords, ...(entry.keywordsAr ?? [])].map((word) => word.toLowerCase());
    const score = labels.some((label) => label.startsWith(needle)) ? 0
      : labels.some((label) => label.includes(needle)) ? 1
        : keywords.some((word) => word.startsWith(needle)) ? 2
          : keywords.some((word) => word.includes(needle)) ? 3
            : -1;
    if (score >= 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || settingsEntryLabel(a.entry, locale).localeCompare(settingsEntryLabel(b.entry, locale)))
    .map(({ entry }) => entry);
}

/**
 * Open a setting: bring its row on screen and mark it for a moment.
 *
 * The page renders one section at a time, so the row only exists after the
 * section change has painted; hence the frame wait rather than an immediate
 * lookup.
 */
export function revealSetting(id: string): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-setting="${id}"]`);
      if (!row) return;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.dataset.settingFound = 'true';
      window.setTimeout(() => { delete row.dataset.settingFound; }, 1600);
    });
  });
}
