import type { Locale } from '../app/i18n';

const copy = {
  en: {
    cloudBackupTitle: 'Max Cloud Backup',
    cloudBackupDescription: 'Keep a copy of this workspace off this machine. Max works exactly the same with this off.',
    cloudCreate: 'Back up to the cloud now',
    cloudCreating: 'Backing up…',
    cloudCreated: 'Cloud backup created.',
    cloudDownload: 'Download',
    cloudDownloading: 'Downloading…',
    cloudDownloaded: 'Downloaded and checksum verified. It is now in your local backups.',
    cloudEmpty: 'No cloud backups yet.',
    cloudEnable: 'Use Max Cloud Backup',
    cloudLoading: 'Loading cloud backups…',
    cloudNotConfigured: 'This build of Max was not given a Max Cloud address, so cloud backup is unavailable.',
    cloudRefresh: 'Refresh list',
    cloudRestore: 'Restore',
    cloudRestored: 'Workspace restored from the cloud backup. Restart Max to see it.',
    cloudRestoring: 'Restoring…',
    cloudSignInPrompt: 'Sign in to create and read cloud backups.',
    cloudSnapshots: 'Cloud backups',
    localKeptOnFailure: 'The local backup was created and is safe. Only the cloud copy failed.',
    lastCloudBackup: 'Last successful cloud backup',
    never: 'Never',
  },
  ar: {
    cloudBackupTitle: 'نسخ Max السحابي',
    cloudBackupDescription: 'احتفظ بنسخة من مساحة العمل خارج هذا الجهاز. يعمل Max بالطريقة نفسها تمامًا وهذا الخيار مغلق.',
    cloudCreate: 'إنشاء نسخة سحابية الآن',
    cloudCreating: 'جارٍ النسخ…',
    cloudCreated: 'تم إنشاء النسخة السحابية.',
    cloudDownload: 'تنزيل',
    cloudDownloading: 'جارٍ التنزيل…',
    cloudDownloaded: 'تم التنزيل والتحقق من البصمة. النسخة الآن ضمن نسخك المحلية.',
    cloudEmpty: 'لا توجد نسخ سحابية بعد.',
    cloudEnable: 'تفعيل النسخ السحابي',
    cloudLoading: 'جارٍ تحميل النسخ السحابية…',
    cloudNotConfigured: 'لم يُضبط عنوان Max السحابي في هذا الإصدار، لذا النسخ السحابي غير متاح.',
    cloudRefresh: 'تحديث القائمة',
    cloudRestore: 'استعادة',
    cloudRestored: 'تمت استعادة مساحة العمل من النسخة السحابية. أعد تشغيل Max لعرضها.',
    cloudRestoring: 'جارٍ الاستعادة…',
    cloudSignInPrompt: 'سجّل الدخول لإنشاء النسخ السحابية وقراءتها.',
    cloudSnapshots: 'النسخ السحابية',
    localKeptOnFailure: 'أُنشئت النسخة المحلية وهي سليمة. الفشل كان في النسخة السحابية فقط.',
    lastCloudBackup: 'آخر نسخة سحابية ناجحة',
    never: 'لا يوجد',
  },
} as const;

export type CloudBackupCopyKey = keyof typeof copy.en;

export function cloudBackupCopy(locale: Locale, key: CloudBackupCopyKey): string {
  return copy[locale][key];
}
