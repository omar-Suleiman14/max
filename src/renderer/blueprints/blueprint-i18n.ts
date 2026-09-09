import type { Locale } from '../app/i18n';

const copy = {
  en: {
    blueprint: 'Blueprint',
    blueprintExportSuccess: 'Blueprint copied to clipboard / exported successfully.',
    blueprintImportSuccess: 'Blueprint imported successfully.',
    blueprintTitle: 'Workspace Blueprints',
    cancel: 'Cancel',
    close: 'Close',
    copiedToClipboard: 'Copied to clipboard!',
    copyJson: 'Copy JSON',
    downloadJson: 'Download File',
    exportBlueprint: 'Export Blueprint',
    exportSubtitle: 'Export databases, pages, records, views, templates and Quick Actions into a portable JSON blueprint.',
    importBlueprint: 'Import Blueprint',
    importConfirm: 'Import and Apply',
    importError: 'Could not import blueprint.',
    importSubtitle: 'Import a version 2 blueprint into this workspace. Existing data stays intact. Preview validates the import without saving changes.',
    itemPropertiesCount: 'item properties',
    pasteOrUpload: 'Paste blueprint JSON or select a file',
    personPropertiesCount: 'person properties',
    preview: 'Blueprint Preview',
    shopName: 'Shop Name',
    templatesCount: 'templates',
    version: 'Version',
  },
  ar: {
    blueprint: 'المخطط',
    blueprintExportSuccess: 'تم نسخ المخطط إلى الحافظة / تصديره بنجاح.',
    blueprintImportSuccess: 'تم استيراد المخطط وتطبيقه بنجاح.',
    blueprintTitle: 'مخططات المتجر',
    cancel: 'إلغاء',
    close: 'إغلاق',
    copiedToClipboard: 'تم النسخ إلى الحافظة!',
    copyJson: 'نسخ JSON',
    downloadJson: 'تنزيل ملف',
    exportBlueprint: 'تصدير المخطط',
    exportSubtitle: 'تصدير المخطط والخصائص وقوالب العمل كملف JSON مستقل وقابل للنقل.',
    importBlueprint: 'استيراد مخطط',
    importConfirm: 'استيراد وتطبيق',
    importError: 'تعذر استيراد المخطط.',
    importSubtitle: 'استيراد مخطط موجود لإضافة وتحديث الخصائص وقوالب العمل.',
    itemPropertiesCount: 'خاصية عناصر',
    pasteOrUpload: 'الصق نص JSON أو اختر ملفًا',
    personPropertiesCount: 'خاصية أشخاص',
    preview: 'معاينة المخطط',
    shopName: 'اسم المتجر',
    templatesCount: 'قالب',
    version: 'الإصدار',
  },
} as const;

export type BlueprintCopyKey = keyof typeof copy.en;

export function blueprintCopy(locale: Locale, key: BlueprintCopyKey): string {
  return copy[locale][key];
}
