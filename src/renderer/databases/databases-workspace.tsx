import { Database, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../app/i18n';
import type { NavigationItem } from '../../shared/workspace-contract';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { DatabasePage } from './DatabasePage';
import './database.css';

export type DatabaseTab = string;
export function DatabasesWorkspace({ initialTab, locale }: { initialTab?: DatabaseTab; locale: Locale }) {
  const [databases, setDatabases] = useState<readonly NavigationItem[]>([]);
  const [selected, setSelected] = useState(initialTab ?? '');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(() => {
    void window.maxApi.workspace.getNavigation().then((navigation) => setDatabases(navigation.databases)).catch((cause: unknown) => setError(String(cause)));
  }, []);
  useEffect(() => { refresh(); window.addEventListener('max:workspace-changed', refresh); return () => window.removeEventListener('max:workspace-changed', refresh); }, [refresh]);
  const active = databases.find((database) => database.id === selected || database.legacyAlias === selected);
  const ar = locale === 'ar';
  return <div className="database-page-container" dir={ar ? 'rtl' : 'ltr'}>
    <nav className="database-directory-nav" aria-label={ar ? 'قواعد البيانات' : 'Databases'}>
      <button type="button" onClick={() => setSelected('')}><Database size={15} />{ar ? 'قواعد البيانات' : 'Databases'}</button>
      {active && <><span>/</span><span>{active.title}</span></>}
      <button type="button" onClick={() => setCreating(true)}><Plus size={15} />{ar ? 'جديد' : 'New database'}</button>
    </nav>
    {error && <p role="alert" className="form-error">{error}</p>}
    {active ? <DatabasePage key={active.id} databaseId={active.id} locale={locale} /> : <div className="database-directory">
      <h1>{ar ? 'قواعد البيانات' : 'Databases'}</h1>
      {databases.map((database) => <button key={database.id} type="button" onClick={() => setSelected(database.id)}><PageIconRenderer icon={database.icon ?? 'lucide:Database'} size={18} /><span>{database.title}</span></button>)}
      <button type="button" onClick={() => setCreating(true)}><Plus size={17} />{ar ? 'قاعدة بيانات جديدة' : 'New database'}</button>
    </div>}
    {creating && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={ar ? 'قاعدة بيانات جديدة' : 'New database'} onClick={() => setCreating(false)}>
      <form className="modal-container modal-sm" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault(); if (busy || !name.trim()) return; setBusy(true);
        void window.maxApi.workspace.createDatabase({ title: name.trim() }).then((result) => {
          if (!result.ok) { setError(result.error.message); return; }
          setSelected(result.value.id); setName(''); setCreating(false); refresh();
          window.dispatchEvent(new Event('max:workspace-changed'));
        }).catch((cause: unknown) => setError(String(cause))).finally(() => setBusy(false));
      }}>
        <div className="modal-header"><h3>{ar ? 'قاعدة بيانات جديدة' : 'New database'}</h3><button type="button" className="btn-icon" aria-label="Close" onClick={() => setCreating(false)}><X size={16} /></button></div>
        <div className="modal-body"><input autoFocus className="input-field" aria-label={ar ? 'الاسم' : 'Name'} placeholder={ar ? 'اسم قاعدة البيانات' : 'Database name'} value={name} onChange={(event) => setName(event.target.value)} required /></div>
        <div className="modal-footer"><button className="btn btn-primary" disabled={busy || !name.trim()} type="submit">{ar ? 'إنشاء' : 'Create'}</button></div>
      </form>
    </div>}
  </div>;
}
