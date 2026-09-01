import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft, WorkspaceRecordPatch } from '../../shared/property-contract';
import type { QueryCalculationResult, RecordGroup } from '../../shared/query-contract';
import type { ViewLayout, WorkspaceView } from '../../shared/view-contract';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { ListView } from './ListView';
import { TableView } from './TableView';

type DatabaseViewHostProps = Readonly<{
  activeView: WorkspaceView | null;
  calculations: readonly QueryCalculationResult[];
  databaseId: string;
  groups?: readonly RecordGroup[];
  onArchiveRecord: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
  onUpdateRecord: (recordId: string, patch: WorkspaceRecordPatch) => Promise<void>;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
}>;

export function DatabaseViewHost({
  activeView,
  calculations,
  databaseId,
  groups,
  onArchiveRecord,
  onCreateRecord,
  onOpenRecord,
  onUpdateRecord,
  records,
  schema,
}: DatabaseViewHostProps) {
  const layout: ViewLayout = activeView?.layout || 'table';

  if (groups && groups.length > 0) {
    return <div className="space-y-5">{groups.map((group) => (
      <section className="database-record-group" key={group.groupKey}>
        <h3 className="mb-2 text-sm font-semibold">{group.label} <span className="text-muted">({group.totalCount})</span></h3>
        <DatabaseViewHost
          activeView={activeView}
          calculations={group.calculations ?? []}
          databaseId={databaseId}
          onArchiveRecord={onArchiveRecord}
          onCreateRecord={onCreateRecord}
          onOpenRecord={onOpenRecord}
          onUpdateRecord={onUpdateRecord}
          records={group.records}
          schema={schema}
        />
      </section>
    ))}</div>;
  }

  switch (layout) {
    case 'board':
      return (
        <BoardView
          databaseId={databaseId}
          onArchiveRecord={onArchiveRecord}
          onCreateRecord={onCreateRecord}
          onOpenRecord={onOpenRecord}
          onUpdateRecord={onUpdateRecord}
          records={records}
          schema={schema}
        />
      );

    case 'list':
      return (
        <ListView
          databaseId={databaseId}
          onArchiveRecord={onArchiveRecord}
          onCreateRecord={onCreateRecord}
          onOpenRecord={onOpenRecord}
          records={records}
          schema={schema}
        />
      );

    case 'calendar':
      return (
        <CalendarView
          databaseId={databaseId}
          onArchiveRecord={onArchiveRecord}
          onCreateRecord={onCreateRecord}
          onOpenRecord={onOpenRecord}
          records={records}
          schema={schema}
        />
      );

    case 'table':
    default:
      return (
        <TableView
          calculations={calculations}
          databaseId={databaseId}
          onArchiveRecord={onArchiveRecord}
          onCreateRecord={onCreateRecord}
          onOpenRecord={onOpenRecord}
          onUpdateRecord={onUpdateRecord}
          records={records}
          schema={schema}
        />
      );
  }
}
