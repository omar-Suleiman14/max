import type { Locale } from '../app/i18n';

const copy = {
  en: {
    accounts: 'Accounts',
    items: 'Catalog Products',
    noResults: 'No results found for',
    open: 'Open',
    pages: 'Custom Pages',
    people: 'People / Customers',
    results: 'Results',
    search: 'Universal Search',
    searchHint: 'Search anything across products, people, accounts, and transactions...',
    searchPlaceholder: 'Search products, people, accounts, receipts... (Ctrl+F)',
    transactions: 'Transactions & Receipts',
    views: 'Saved Views',
  },
  ar: {
    accounts: 'الحسابات المالية',
    items: 'المنتجات والأصناف',
    noResults: 'لا توجد نتائج تطابق',
    open: 'فتح',
    pages: 'الصفحات المخصصة',
    people: 'العملاء والأشخاص',
    results: 'النتائج',
    search: 'البحث الشامل',
    searchHint: 'ابحث عن أي شيء في المنتجات، العملاء، الحسابات، والمعاملات...',
    searchPlaceholder: 'ابحث في المنتجات، العملاء، الحسابات، الإيصالات... (Ctrl+F)',
    transactions: 'المعاملات والإيصالات',
    views: 'طرق العرض المحفوظة',
  },
} as const;

export type SearchCopyKey = keyof typeof copy.en;

export function searchCopy(locale: Locale, key: SearchCopyKey): string {
  return copy[locale][key];
}
