import type { Locale } from '../app/i18n';

const copy = {
  en: {
    allRecords: 'All Records',
    allViews: 'All Views',
    cancel: 'Cancel',
    createView: 'Save View',
    customViews: 'Saved Views',
    defaultView: 'Default View',
    deleteView: 'Delete View',
    filterBy: 'Filter',
    groupBy: 'Group By',
    name: 'View Name',
    namePlaceholder: 'e.g., Low Stock, High Debt, VIP Customers',
    noViews: 'No custom views saved yet.',
    save: 'Save',
    saveCurrentView: 'Save Current View',
    sortBy: 'Sort',
    viewSaved: 'View saved successfully.',
  },
  ar: {
    allRecords: 'جميع السجلات',
    allViews: 'كل طرق العرض',
    cancel: 'إلغاء',
    createView: 'حفظ طريقة العرض',
    customViews: 'طرق العرض المحفوظة',
    defaultView: 'كل السجلات',
    deleteView: 'حذف طريقة العرض',
    filterBy: 'تصفية',
    groupBy: 'تجميع حسب',
    name: 'اسم طريقة العرض',
    namePlaceholder: 'مثال: نواقص المخزن، كبار العملاء، ديون متأخرة',
    noViews: 'لا توجد طرق عرض مخصصة بعد.',
    save: 'حفظ',
    saveCurrentView: 'حفظ طريقة العرض الحالية',
    sortBy: 'ترتيب',
    viewSaved: 'تم حفظ العرض بنجاح.',
  },
} as const;

export type ViewsCopyKey = keyof typeof copy.en;

export function viewsCopy(locale: Locale, key: ViewsCopyKey): string {
  return copy[locale][key];
}
