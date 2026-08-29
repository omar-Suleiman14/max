import type { ObjectErrorCode, ObjectKind, PropertyType } from '../../shared/object-contract';
import type { Locale } from '../app/i18n';

const copy = {
  en: {
    addProperty: 'Add property',
    archive: 'Archive',
    archiveBody: 'This removes it from active work while preserving its audit history.',
    archiveProperty: 'Archive property?',
    archiveRecord: 'Archive record?',
    auditArchived: 'Archived',
    auditCreated: 'Created',
    auditEmpty: 'No history entries yet.',
    auditTitle: 'Change history',
    auditUpdated: 'Updated',
    cancel: 'Cancel',
    choices: 'Allowed choices',
    choicesHint: 'One choice per line',
    close: 'Close',
    createItem: 'Create item',
    createPerson: 'Add person',
    digitsOnly: 'Digits only',
    edit: 'Edit',
    editItem: 'Edit item',
    editPerson: 'Edit person',
    editProperty: 'Edit property',
    emptyBody: 'Create the first record or configure properties for the way this shop works.',
    emptyItems: 'No items yet',
    emptyPeople: 'No people yet',
    errorInvalid: 'Check the entered value and its property rules.',
    errorNotFound: 'This record or property is no longer available.',
    errorRelation: 'Choose an active related record.',
    errorRequired: 'Complete every required field.',
    errorSchema: 'This schema change conflicts with existing records.',
    errorUnique: 'This value must be unique.',
    label: 'Display name',
    labelHintItem: 'A clear name for this item',
    labelHintPerson: 'A clear name for this person',
    maximum: 'Maximum',
    maximumLength: 'Maximum length',
    minimum: 'Minimum',
    minimumLength: 'Minimum length',
    noProperties: 'No custom properties',
    noPropertiesBody: 'The display name works now. Add only the fields this shop actually needs.',
    optional: 'Optional',
    properties: 'Properties',
    propertyName: 'Property name',
    records: 'records',
    relationTarget: 'Related object',
    required: 'Required',
    save: 'Save',
    schema: 'Schema',
    schemaSummary: 'Configuration is stored as data, never hardcoded shop fields.',
    type: 'Type',
    unique: 'Unique',
    unknownError: 'Max could not complete that change. Your existing data is unchanged.',
  },
  ar: {
    addProperty: 'إضافة خاصية',
    archive: 'أرشفة',
    archiveBody: 'سيختفي من العمل النشط مع الاحتفاظ بسجل التغييرات.',
    archiveProperty: 'أرشفة الخاصية؟',
    archiveRecord: 'أرشفة السجل؟',
    auditArchived: 'تمت الأرشفة',
    auditCreated: 'تم الإنشاء',
    auditEmpty: 'لا توجد تغييرات مسجلة بعد.',
    auditTitle: 'سجل التغييرات',
    auditUpdated: 'تم التحديث',
    cancel: 'إلغاء',
    choices: 'الخيارات المسموح بها',
    choicesHint: 'خيار واحد في كل سطر',
    close: 'إغلاق',
    createItem: 'إنشاء عنصر',
    createPerson: 'إضافة شخص',
    digitsOnly: 'أرقام فقط',
    edit: 'تعديل',
    editItem: 'تعديل العنصر',
    editPerson: 'تعديل الشخص',
    editProperty: 'تعديل الخاصية',
    emptyBody: 'أنشئ أول سجل أو اضبط الخصائص بما يناسب طريقة عمل هذا المتجر.',
    emptyItems: 'لا توجد عناصر بعد',
    emptyPeople: 'لا يوجد أشخاص بعد',
    errorInvalid: 'راجع القيمة المدخلة وقواعد الخاصية.',
    errorNotFound: 'هذا السجل أو الخاصية لم يعد متاحًا.',
    errorRelation: 'اختر سجلًا مرتبطًا ونشطًا.',
    errorRequired: 'أكمل كل الحقول المطلوبة.',
    errorSchema: 'يتعارض تغيير المخطط مع السجلات الحالية.',
    errorUnique: 'يجب ألا تتكرر هذه القيمة.',
    label: 'اسم العرض',
    labelHintItem: 'اسم واضح لهذا العنصر',
    labelHintPerson: 'اسم واضح لهذا الشخص',
    maximum: 'الحد الأقصى',
    maximumLength: 'أقصى طول',
    minimum: 'الحد الأدنى',
    minimumLength: 'أدنى طول',
    noProperties: 'لا توجد خصائص مخصصة',
    noPropertiesBody: 'يمكن استخدام اسم العرض الآن. أضف فقط الحقول التي يحتاجها المتجر فعلًا.',
    optional: 'اختياري',
    properties: 'الخصائص',
    propertyName: 'اسم الخاصية',
    records: 'سجل',
    relationTarget: 'نوع السجل المرتبط',
    required: 'مطلوب',
    save: 'حفظ',
    schema: 'المخطط',
    schemaSummary: 'يُحفظ الإعداد كبيانات، لا كحقول متجر ثابتة.',
    type: 'النوع',
    unique: 'فريد',
    unknownError: 'لم يتمكن ماكس من إكمال التغيير. بياناتك الحالية لم تتغير.',
  },
} as const;

export type ObjectCopyKey = keyof typeof copy.en;

export function objectCopy(locale: Locale, key: ObjectCopyKey): string {
  return copy[locale][key];
}

const typeCopy: Record<Locale, Record<PropertyType, string>> = {
  en: { checkbox: 'Checkbox', date: 'Date', money: 'Money', number: 'Number', relation: 'Relation', select: 'Select', status: 'Status', text: 'Text' },
  ar: { checkbox: 'مربع اختيار', date: 'تاريخ', money: 'مال', number: 'رقم', relation: 'علاقة', select: 'اختيار', status: 'حالة', text: 'نص' },
};

export function propertyTypeLabel(locale: Locale, type: PropertyType): string {
  return typeCopy[locale][type];
}

export function objectKindLabel(locale: Locale, kind: ObjectKind): string {
  if (locale === 'ar') return kind === 'item' ? 'عنصر' : 'شخص';
  return kind === 'item' ? 'Item' : 'Person';
}

const errorCopy: Record<ObjectErrorCode, ObjectCopyKey> = {
  'invalid-input': 'errorInvalid',
  'not-found': 'errorNotFound',
  'relation-not-found': 'errorRelation',
  required: 'errorRequired',
  'schema-conflict': 'errorSchema',
  unique: 'errorUnique',
};

export function objectError(locale: Locale, code: ObjectErrorCode): string {
  return objectCopy(locale, errorCopy[code]);
}

