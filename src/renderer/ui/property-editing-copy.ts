import type { Locale } from '../app/i18n';

const copy = {
  ar: {
    readOnly: 'هذه القيمة ينشئها Max تلقائيًا ولا يمكن تعديلها.',
    saveFailed: 'تعذر حفظ الخاصية. تحقق من القيمة وحاول مرة أخرى.',
  },
  en: {
    readOnly: 'This value is generated automatically by Max and cannot be edited.',
    saveFailed: 'Could not save the property. Check the value and try again.',
  },
} as const;

export function propertySaveError(locale: Locale): string {
  return copy[locale].saveFailed;
}

export function propertyReadOnlyReason(locale: Locale): string {
  return copy[locale].readOnly;
}
