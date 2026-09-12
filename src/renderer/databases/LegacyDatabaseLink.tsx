import { lazy, useEffect, useState } from 'react';
import type { Locale } from '../app/i18n';
import { DatabaseSkeleton } from './DatabaseSkeleton';
const DatabasePage = lazy(() => import('./DatabasePage').then(module => ({ default: module.DatabasePage })));

/** Read old links through their migration identity, never through display names. */
export function LegacyDatabaseLink({ alias, locale }: { alias: string; locale: Locale }) {
  const [databaseId, setDatabaseId] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void window.maxApi.workspace.getNavigation().then((navigation) => {
      if (!active) return;
      setDatabaseId(navigation.databases.find((database) => database.legacyAlias === alias)?.id);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [alias]);
  if (databaseId) return <DatabasePage key={databaseId} databaseId={databaseId} embedded locale={locale} />;
  if (!loaded) return <DatabaseSkeleton embedded locale={locale} rows={3} />;
  return <p className="text-muted">{locale === 'ar'
    ? 'اختر قاعدة بيانات باستخدام الأمر / لربط هذا العرض.'
    : 'Use / to link a database to this page.'}</p>;
}
