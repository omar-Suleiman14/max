import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft, WorkspaceRecordPatch } from '../../shared/property-contract';
import type { QueryCalculationResult } from '../../shared/query-contract';
import type { ViewLayout, WorkspaceView } from '../../shared/view-contract';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { ListView } from './ListView';
import { TableView } from './TableView';

type DatabaseViewHostProps = Readonly<{
  activeView: WorkspaceView | null;
  calculations: readonly QueryCalculationResult[];
  databaseId: string;
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
  onArchiveRecord,
  onCreateRecord,
  onOpenRecord,
  onUpdateRecord,
  records,
  schema,
}: DatabaseViewHostProps) {
  const layout: ViewLayout = activeView?.layout || 'table';

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
