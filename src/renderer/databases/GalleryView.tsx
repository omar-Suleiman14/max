import { FileText, Plus } from 'lucide-react';
import type { WorkspaceRecord } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';
export function GalleryView({ records, onOpenRecord, onCreate, locale }: { records: readonly WorkspaceRecord[]; onOpenRecord: (record: WorkspaceRecord) => void; onCreate: () => void; locale: Locale }) {
  return <div className="database-gallery">{records.map((record) => <button className="database-gallery-card" key={record.id} type="button" onClick={() => onOpenRecord(record)}>
    <div className="database-gallery-preview"><FileText size={32} strokeWidth={1} /></div><strong>{record.title}</strong>
  </button>)}<button className="database-gallery-new" type="button" onClick={onCreate}><Plus size={17} />{locale === 'ar' ? 'صفحة جديدة' : 'New page'}</button></div>;
}
