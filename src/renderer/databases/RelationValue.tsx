import { FileText, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';
import { RelationPicker } from './RelationPicker';

export function RelationValue({ recordId, property, locale = 'en' }: { recordId: string; property: WorkspaceProperty; locale?: Locale }) {
  const [related, setRelated] = useState<readonly WorkspaceRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const relationId = typeof property.config.relationId === 'string' ? property.config.relationId : '';
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!relationId) return;
      void window.maxApi.workspace.getRelatedRecords(recordId, relationId).then((records) => {
        if (active) setRelated(records);
      }).catch((cause: unknown) => { if (active) setError(String(cause)); });
    };
    refresh();
    window.addEventListener('max:workspace-changed', refresh);
    return () => { active = false; window.removeEventListener('max:workspace-changed', refresh); };
  }, [recordId, relationId]);
  async function change(targetId: string, unlink = false) {
    const result = unlink
      ? await window.maxApi.workspace.unlinkRecords(relationId, recordId, targetId)
      : await window.maxApi.workspace.linkRecords(relationId, recordId, targetId);
    if (!result.ok) throw new Error(result.error.message);
    setRelated(await window.maxApi.workspace.getRelatedRecords(recordId, relationId));
    window.dispatchEvent(new Event('max:workspace-changed'));
  }
  return <div className="relation-value">
    {related.map((record) => <button className="relation-page-link" key={record.id} type="button" onClick={(event) => event.currentTarget.dispatchEvent(new CustomEvent('max:open-record', { bubbles: true, detail: record }))}>
      <FileText size={14} /><span>{record.title}</span>
    </button>)}
    <button className="relation-add" disabled={!relationId} type="button" onClick={() => setOpen(true)} aria-label={`${locale === 'ar' ? 'ربط صفحة' : 'Link page'}: ${property.name}`}><Plus size={13} />{!related.length && (locale === 'ar' ? 'فارغ' : 'Empty')}</button>
    {error && <span role="alert">{error}</span>}
    <RelationPicker locale={locale} isOpen={open} onClose={() => setOpen(false)} onLink={(id) => change(id)} onUnlink={(id) => change(id, true)} recordId={recordId} relationId={relationId} selectedTargetIds={related.map((record) => record.id)} title={property.name} />
  </div>;
}
