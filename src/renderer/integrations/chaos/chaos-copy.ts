import type { Locale } from '../../app/i18n';
import {
  responseCountDisplay,
  type ChaosErrorCode,
  type ChaosFieldType,
  type ChaosItemKind,
  type ChaosItemStatus,
  type ChaosLinkState,
  type ChaosScope,
  type ChaosSummary,
} from '../../../shared/chaos-integration-contract';

const en = {
  access: 'Access',
  accessAll: 'All of the owner’s forms and quizzes',
  accessSelected: 'Only items the owner selected, plus drafts this connection creates',
  addField: 'Add field',
  adoptChaos: 'Use the Chaos version',
  apiOrigin: 'Chaos API address',
  apiOriginHelp: 'The API origin of your hosted or self-hosted Chaos, for example https://example-123.convex.site.',
  attach: 'Attach to this page',
  cancel: 'Cancel',
  changePreview: 'Changes that will be sent',
  chaosSide: 'In Chaos now',
  close: 'Close',
  compatibility: 'Compatibility report',
  conflictBody: 'Someone changed this draft in Chaos after Max last saw it. Nothing was overwritten. Compare both versions, then choose which to keep.',
  conflictTitle: 'The Chaos draft changed',
  connect: 'Save connection',
  connected: 'Connected',
  connectionsDescription: 'Link Chaos forms and quizzes to pages. Chaos keeps the forms and every response; Max keeps only links and summaries.',
  connectionsTitle: 'Chaos',
  copied: 'Copied',
  copyShare: 'Copy share link',
  copyTemplate: 'Copy as template',
  create: 'Create draft in Chaos',
  createInChaos: 'Create in Chaos',
  createNote: 'This creates a draft form or quiz in Chaos. Chaos owns it and collects its responses; responses live in Chaos, not in Max. To collect records inside Max, use a Max form view on a database instead.',
  created: 'Draft created in Chaos.',
  descriptionLabel: 'Description (optional)',
  disconnect: 'Disconnect',
  disconnectBody: 'Max forgets the token on this computer. Linked items stay on your pages, shown as disconnected. Nothing in Chaos is deleted.',
  disconnected: 'Disconnected',
  dropped: 'Left out',
  edit: 'Edit in Chaos',
  editFields: 'Edit fields in Max',
  empty: 'No Chaos forms or quizzes are linked to this page.',
  fewerThan: (n: number) => `Fewer than ${n} responses`,
  fieldDescription: 'Help text',
  fieldLabel: 'Label',
  fieldType: 'Type',
  fields: 'Fields',
  fieldsEmpty: 'Add fields yourself, or prefill them from database properties. Page text is never turned into questions.',
  form: 'Form',
  kind: 'Type',
  lastUpdated: (when: string) => `Last updated ${when}`,
  link: 'Link existing',
  linkByIdLabel: 'Or paste a Chaos item id',
  linkTitle: 'Link a Chaos form or quiz',
  loadMore: 'Load more',
  localChanges: 'Changes in Max not sent to Chaos yet',
  mine: 'In Max',
  moveDown: 'Move down',
  moveUp: 'Move up',
  needsToken: 'This computer has no token for the saved connection. Paste a token to reconnect.',
  never: 'never',
  noItems: 'No items are shared with this connection yet.',
  notConnected: 'Connect Chaos in Settings to create or link forms.',
  notDraft: 'This item is published or already has responses, so Chaos protects it. Change it in the Chaos editor.',
  notSent: 'Never sent',
  open: 'Open in Chaos editor',
  openPath: (path: string) => `Open Chaos and go to ${path}`,
  options: 'Options (one per line)',
  overwrite: 'Replace the Chaos draft with mine',
  panelTitle: 'Chaos forms & quizzes',
  pendingCreate: 'A draft was being created when Max lost contact with Chaos.',
  pendingUpdate: 'An update was being sent when Max lost contact with Chaos.',
  pendingRetryNote: 'Retrying sends the same request again; Chaos will not create a duplicate.',
  pickProperties: 'Prefill from database properties',
  pickPropertiesHelp: 'Pick the properties to turn into fields. Only their names, types and option labels are used; no records are sent.',
  points: 'Points',
  preview: 'Exactly what will be sent',
  quiz: 'Quiz',
  quizAnswer: 'Correct answer (optional)',
  refresh: 'Refresh',
  remove: 'Remove',
  required: 'Required',
  responses: (n: number) => `${n} responses`,
  results: 'View results in Chaos',
  retry: 'Retry',
  discard: 'Discard',
  rows: 'Rows (one per line)',
  save: 'Save in Max',
  scopes: 'Permissions',
  secureStorageMissing: 'This computer has no secure credential storage, so Max cannot keep a Chaos token. Chaos connections are unavailable here.',
  selectDatabase: 'Database',
  sendUpdate: 'Update Chaos draft',
  sourceLabel: 'Sent as provenance',
  test: 'Test connection',
  testOk: 'Connection works.',
  title: 'Title',
  token: 'Connection token',
  tokenHelp: 'Create a token in Chaos under Dashboard → Connections and paste it here. Max stores it encrypted by your operating system and never shows it again.',
  unlink: 'Unlink',
  unlinkBody: 'This removes the link from this page only. It does not delete the Chaos item or any of its responses.',
  unlinkTitle: 'Unlink from this page?',
  unsupported: 'Will not be sent',
  update: 'Update Chaos draft',
  updated: 'Chaos draft updated.',
  useTemplate: 'Create a new draft from this template',
  warnings: 'Chaos noted',
  workspace: 'Chaos workspace',
} as const;

type Copy = { [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string ? (...args: A) => string : string };

const ar: Copy = {
  access: 'الوصول',
  accessAll: 'جميع نماذج واختبارات المالك',
  accessSelected: 'العناصر التي اختارها المالك فقط، ومسودات هذا الاتصال',
  addField: 'إضافة حقل',
  adoptChaos: 'استخدام نسخة Chaos',
  apiOrigin: 'عنوان واجهة Chaos',
  apiOriginHelp: 'عنوان واجهة Chaos المستضافة أو الذاتية، مثل https://example-123.convex.site.',
  attach: 'ربط بهذه الصفحة',
  cancel: 'إلغاء',
  changePreview: 'التغييرات التي سترسل',
  chaosSide: 'في Chaos الآن',
  close: 'إغلاق',
  compatibility: 'تقرير التوافق',
  conflictBody: 'غيّر أحدهم هذه المسودة في Chaos بعد آخر مرة رآها Max. لم يُستبدل شيء. قارن النسختين ثم اختر ما تريد الاحتفاظ به.',
  conflictTitle: 'تغيرت مسودة Chaos',
  connect: 'حفظ الاتصال',
  connected: 'متصل',
  connectionsDescription: 'اربط نماذج واختبارات Chaos بالصفحات. يحتفظ Chaos بالنماذج وكل الردود، ويحتفظ Max بالروابط والملخصات فقط.',
  connectionsTitle: 'Chaos',
  copied: 'تم النسخ',
  copyShare: 'نسخ رابط المشاركة',
  copyTemplate: 'نسخ كقالب',
  create: 'إنشاء مسودة في Chaos',
  createInChaos: 'إنشاء في Chaos',
  createNote: 'ينشئ هذا مسودة نموذج أو اختبار في Chaos. يملكها Chaos ويجمع ردودها؛ الردود تبقى في Chaos وليس في Max. لجمع سجلات داخل Max استخدم عرض نموذج Max على قاعدة بيانات.',
  created: 'تم إنشاء المسودة في Chaos.',
  descriptionLabel: 'الوصف (اختياري)',
  disconnect: 'قطع الاتصال',
  disconnectBody: 'ينسى Max الرمز على هذا الجهاز. تبقى العناصر المرتبطة في صفحاتك بحالة غير متصل. لا يُحذف شيء من Chaos.',
  disconnected: 'غير متصل',
  dropped: 'مستبعد',
  edit: 'تحرير في Chaos',
  editFields: 'تحرير الحقول في Max',
  empty: 'لا توجد نماذج أو اختبارات من Chaos مرتبطة بهذه الصفحة.',
  fewerThan: (n: number) => `أقل من ${n} ردود`,
  fieldDescription: 'نص مساعد',
  fieldLabel: 'العنوان',
  fieldType: 'النوع',
  fields: 'الحقول',
  fieldsEmpty: 'أضف الحقول بنفسك أو املأها من خصائص قاعدة بيانات. لا يتحول نص الصفحة إلى أسئلة أبدًا.',
  form: 'نموذج',
  kind: 'النوع',
  lastUpdated: (when: string) => `آخر تحديث ${when}`,
  link: 'ربط عنصر موجود',
  linkByIdLabel: 'أو الصق معرّف عنصر Chaos',
  linkTitle: 'ربط نموذج أو اختبار من Chaos',
  loadMore: 'تحميل المزيد',
  localChanges: 'تغييرات في Max لم ترسل إلى Chaos بعد',
  mine: 'في Max',
  moveDown: 'نقل للأسفل',
  moveUp: 'نقل للأعلى',
  needsToken: 'لا يوجد على هذا الجهاز رمز للاتصال المحفوظ. الصق رمزًا لإعادة الاتصال.',
  never: 'أبدًا',
  noItems: 'لا توجد عناصر مشاركة مع هذا الاتصال بعد.',
  notConnected: 'اربط Chaos من الإعدادات لإنشاء النماذج أو ربطها.',
  notDraft: 'هذا العنصر منشور أو لديه ردود، لذا يحميه Chaos. عدّله من محرر Chaos.',
  notSent: 'لا يرسل أبدًا',
  open: 'فتح في محرر Chaos',
  openPath: (path: string) => `افتح Chaos وانتقل إلى ${path}`,
  options: 'الخيارات (خيار في كل سطر)',
  overwrite: 'استبدال مسودة Chaos بنسختي',
  panelTitle: 'نماذج واختبارات Chaos',
  pendingCreate: 'كان إنشاء مسودة جاريًا عندما فقد Max الاتصال بـ Chaos.',
  pendingUpdate: 'كان إرسال تحديث جاريًا عندما فقد Max الاتصال بـ Chaos.',
  pendingRetryNote: 'إعادة المحاولة ترسل الطلب نفسه؛ لن ينشئ Chaos نسخة مكررة.',
  pickProperties: 'ملء من خصائص قاعدة بيانات',
  pickPropertiesHelp: 'اختر الخصائص التي تصبح حقولًا. تستخدم أسماؤها وأنواعها وتسميات خياراتها فقط، ولا ترسل أي سجلات.',
  points: 'النقاط',
  preview: 'ما سيرسل بالضبط',
  quiz: 'اختبار',
  quizAnswer: 'الإجابة الصحيحة (اختياري)',
  refresh: 'تحديث',
  remove: 'إزالة',
  required: 'مطلوب',
  responses: (n: number) => `${n} ردود`,
  results: 'عرض النتائج في Chaos',
  retry: 'إعادة المحاولة',
  discard: 'تجاهل',
  rows: 'الصفوف (صف في كل سطر)',
  save: 'حفظ في Max',
  scopes: 'الصلاحيات',
  secureStorageMissing: 'لا يوفر هذا الجهاز تخزينًا آمنًا لبيانات الاعتماد، لذا لا يستطيع Max حفظ رمز Chaos. اتصالات Chaos غير متاحة هنا.',
  selectDatabase: 'قاعدة البيانات',
  sendUpdate: 'تحديث مسودة Chaos',
  sourceLabel: 'يرسل كمصدر',
  test: 'اختبار الاتصال',
  testOk: 'الاتصال يعمل.',
  title: 'العنوان',
  token: 'رمز الاتصال',
  tokenHelp: 'أنشئ رمزًا في Chaos من لوحة التحكم ← الاتصالات والصقه هنا. يحفظه Max مشفرًا بواسطة نظام التشغيل ولا يعرضه مرة أخرى.',
  unlink: 'إلغاء الربط',
  unlinkBody: 'يزيل هذا الرابط من هذه الصفحة فقط. لا يحذف عنصر Chaos ولا أيًا من ردوده.',
  unlinkTitle: 'إلغاء الربط من هذه الصفحة؟',
  unsupported: 'لن يرسل',
  update: 'تحديث مسودة Chaos',
  updated: 'تم تحديث مسودة Chaos.',
  useTemplate: 'إنشاء مسودة جديدة من هذا القالب',
  warnings: 'ملاحظات Chaos',
  workspace: 'مساحة عمل Chaos',
};

export function chaosCopy(locale: Locale): Copy {
  return locale === 'ar' ? ar : en;
}

export function kindLabel(locale: Locale, kind: ChaosItemKind): string {
  return chaosCopy(locale)[kind];
}

const STATUS: Record<Locale, Record<ChaosItemStatus, string>> = {
  ar: { archived: 'مؤرشف', closed: 'مغلق', draft: 'مسودة', live: 'منشور' },
  en: { archived: 'Archived', closed: 'Closed', draft: 'Draft', live: 'Live' },
};

export function statusLabel(locale: Locale, status: ChaosItemStatus): string {
  return STATUS[locale][status];
}

const STATES: Record<Locale, Record<ChaosLinkState, string>> = {
  ar: {
    disconnected: 'غير متصل: البيانات المحفوظة معروضة',
    error: 'تعذر التحديث: البيانات المحفوظة معروضة',
    'insufficient-scope': 'هذا الاتصال لا يملك الصلاحية لذلك',
    offline: 'Chaos غير متاح: البيانات المحفوظة معروضة',
    ok: '',
    'rate-limited': 'طلب Chaos التمهل. حاول بعد قليل.',
    revoked: 'تم إلغاء الرمز أو انتهت صلاحيته. أعد الاتصال من الإعدادات.',
    unauthorized: 'رفض Chaos الرمز. أعد الاتصال من الإعدادات.',
    unavailable: 'غير متاح أو أُلغي الوصول',
    'unsupported-version': 'خادم Chaos هذا لا يدعم إصدار الواجهة الذي يستخدمه Max.',
  },
  en: {
    disconnected: 'Disconnected — showing saved information',
    error: 'Could not refresh — showing saved information',
    'insufficient-scope': 'This connection is not allowed to do that',
    offline: 'Chaos is unreachable — showing saved information',
    ok: '',
    'rate-limited': 'Chaos asked Max to slow down. Try again shortly.',
    revoked: 'The token was revoked or has expired. Reconnect in Settings.',
    unauthorized: 'Chaos refused the token. Reconnect in Settings.',
    unavailable: 'Unavailable or access revoked',
    'unsupported-version': 'This Chaos server does not support the API version Max uses.',
  },
};

export function linkStateLabel(locale: Locale, state: ChaosLinkState): string {
  return STATES[locale][state];
}

const ERRORS: Partial<Record<ChaosErrorCode, { ar: string; en: string }>> = {
  NETWORK: { ar: 'تعذر الوصول إلى Chaos. تحقق من الاتصال بالإنترنت.', en: 'Could not reach Chaos. Check the internet connection.' },
  NOT_A_DRAFT: { ar: 'هذا العنصر منشور أو لديه ردود، لذا يحميه Chaos من التغييرات من هنا.', en: 'This item is published or has responses, so Chaos protects it from changes made here.' },
  NOT_CONNECTED: { ar: 'Max غير متصل بـ Chaos. اتصل من الإعدادات.', en: 'Max is not connected to Chaos. Connect in Settings.' },
  NOT_FOUND: { ar: 'غير متاح أو أُلغي الوصول.', en: 'Unavailable or access revoked.' },
  RATE_LIMITED: { ar: 'طلب Chaos التمهل. حاول بعد قليل.', en: 'Chaos asked Max to slow down. Try again shortly.' },
  SECURE_STORAGE_UNAVAILABLE: { ar: 'لا يوفر هذا الجهاز تخزينًا آمنًا للرمز.', en: 'This computer has no secure storage for the token.' },
  TIMEOUT: { ar: 'لم يرد Chaos في الوقت المحدد.', en: 'Chaos did not answer in time.' },
  TOKEN_REVOKED: { ar: 'تم إلغاء الرمز أو انتهت صلاحيته.', en: 'The token was revoked or has expired.' },
  UNAUTHORIZED: { ar: 'رفض Chaos الرمز.', en: 'Chaos did not accept the token.' },
};

/** Arabic has its own wording for the common failures; otherwise the main process's message is shown. */
export function errorMessage(locale: Locale, error: Readonly<{ code: ChaosErrorCode; message: string; retryAfterSeconds?: number }>): string {
  const known = ERRORS[error.code];
  const base = known && (locale === 'ar' || !error.message) ? known[locale] : error.message;
  if (error.retryAfterSeconds) return locale === 'ar' ? `${base} (بعد ${error.retryAfterSeconds} ث)` : `${base} (in ${error.retryAfterSeconds}s)`;
  return base;
}

const SCOPES: Record<Locale, Record<ChaosScope, string>> = {
  ar: {
    'definitions:read': 'نسخ التعريفات كقوالب',
    'drafts:create': 'إنشاء مسودات',
    'drafts:update': 'تحديث المسودات',
    'items:read': 'قراءة العناصر',
    'summaries:read': 'قراءة الملخصات',
  },
  en: {
    'definitions:read': 'Copy definitions as templates',
    'drafts:create': 'Create drafts',
    'drafts:update': 'Update drafts',
    'items:read': 'Read items',
    'summaries:read': 'Read aggregate summaries',
  },
};

export function scopeLabel(locale: Locale, scope: ChaosScope): string {
  return SCOPES[locale][scope];
}

const FIELD_TYPES: Record<ChaosFieldType, { ar: string; en: string }> = {
  choice: { ar: 'اختيار واحد', en: 'Single choice' },
  date: { ar: 'تاريخ', en: 'Date' },
  dropdown: { ar: 'قائمة منسدلة', en: 'Dropdown' },
  email: { ar: 'بريد إلكتروني', en: 'Email' },
  matrix: { ar: 'مصفوفة', en: 'Matrix' },
  mcq: { ar: 'اختيار من متعدد', en: 'Multiple choice' },
  multi_choice: { ar: 'اختيارات متعددة', en: 'Checkboxes' },
  multi_select: { ar: 'تحديد متعدد', en: 'Multi-select' },
  number: { ar: 'رقم', en: 'Number' },
  phone: { ar: 'هاتف', en: 'Phone' },
  ranking: { ar: 'ترتيب', en: 'Ranking' },
  rating: { ar: 'تقييم', en: 'Rating' },
  scale: { ar: 'مقياس', en: 'Scale' },
  section: { ar: 'قسم', en: 'Section' },
  statement: { ar: 'عبارة', en: 'Statement' },
  text: { ar: 'نص قصير', en: 'Short text' },
  textarea: { ar: 'نص طويل', en: 'Long text' },
  time: { ar: 'وقت', en: 'Time' },
  true_false: { ar: 'صح أو خطأ', en: 'True or false' },
  url: { ar: 'رابط', en: 'Link' },
  written: { ar: 'إجابة مكتوبة', en: 'Written answer' },
};

export function fieldTypeLabel(locale: Locale, type: ChaosFieldType): string {
  return FIELD_TYPES[type][locale];
}

/** "3 responses", "Fewer than 5 responses", or nothing when no summary is cached. */
export function responseCountLabel(locale: Locale, summary: ChaosSummary | null): string | null {
  const display = responseCountDisplay(summary);
  if (display.kind === 'unknown') return null;
  const copy = chaosCopy(locale);
  return display.kind === 'suppressed' ? copy.fewerThan(display.minimumGroupSize) : copy.responses(display.count);
}

export function formatFetchedAt(locale: Locale, iso: string | null, now = Date.now()): string {
  if (!iso) return chaosCopy(locale).never;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return chaosCopy(locale).never;
  const seconds = Math.round((time - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(Math.round(seconds), 'second');
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), 'hour');
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time));
}
