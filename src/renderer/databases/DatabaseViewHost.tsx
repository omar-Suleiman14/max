import type { Locale } from '../app/i18n';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty, WorkspaceRecord, WorkspaceRecordDraft, WorkspaceRecordPatch } from '../../shared/property-contract';
import type { QueryCalculationResult, RecordGroup } from '../../shared/query-contract';
import type { ViewLayout, WorkspaceView } from '../../shared/view-contract';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { ListView } from './ListView';
import { TableView } from './TableView';
import { GalleryView } from './GalleryView';
import { AdditionalViews } from './AdditionalViews';
import { visiblePropertiesForView } from './view-property-state';

type DatabaseViewHostProps = Readonly<{
  activeView: WorkspaceView | null;
  calculations: readonly QueryCalculationResult[];
  totalCount?: number;
  databaseId: string;
  groups?: readonly RecordGroup[];
  /** Records are still being queried; the frame is already on screen. */
  loading?: boolean;
  locale?: Locale;
  onArchiveRecord: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
  onLayoutConfigChange?: (layoutConfig: Readonly<Record<string, unknown>>) => void;
  onManageProperties?: () => void;
  onEditProperty?: (property: WorkspaceProperty | null) => void;
  onRemoveSorting?: () => Promise<void>;
  onPropertyMove?: (source: string, target: string) => void;
  onColumnResize?: (propertyId: string, width: number) => void;
  onCoverPropertyChange?: (id: string) => void;
  onDatePropertyChange?: (id: string) => void;
  onUpdateRecord: (recordId: string, patch: WorkspaceRecordPatch) => Promise<void>;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
}>;

export function DatabaseViewHost({
  activeView,
  calculations,
  totalCount,
  databaseId,
  groups,
  loading = false,
  locale = 'en',
  onArchiveRecord,
  onCreateRecord,
  onOpenRecord,
  onLayoutConfigChange,
  onManageProperties,
  onEditProperty,
  onColumnResize,
  onPropertyMove,
  onRemoveSorting,
  onCoverPropertyChange,
  onDatePropertyChange,
  onUpdateRecord,
  records,
  schema: sourceSchema,
}: DatabaseViewHostProps) {
  const layout: ViewLayout = activeView?.layout || 'table';
  const columns = activeView?.propertyState.columns ?? [];
  const schema = sourceSchema
    ? { ...sourceSchema, properties: visiblePropertiesForView(sourceSchema.properties, columns) }
    : null;

  if (layout !== 'board' && layout !== 'chart' && groups && groups.length > 0) {
    return <div className="space-y-5">{groups.map((group) => (
      <section className="database-record-group" key={group.groupKey}>
        <h3 className="mb-2 text-sm font-semibold">{group.label} <span className="text-muted">({group.totalCount})</span></h3>
        <DatabaseViewHost
          activeView={activeView}
          calculations={group.calculations ?? []}
          totalCount={group.totalCount}
          databaseId={databaseId}
          loading={loading}
          locale={locale}
          onArchiveRecord={onArchiveRecord}
          onCreateRecord={onCreateRecord}
          onOpenRecord={onOpenRecord}
          onLayoutConfigChange={onLayoutConfigChange}
          onManageProperties={onManageProperties} onEditProperty={onEditProperty}
          onColumnResize={onColumnResize}
          onPropertyMove={onPropertyMove}
          onRemoveSorting={onRemoveSorting}
          onCoverPropertyChange={onCoverPropertyChange}
          onDatePropertyChange={onDatePropertyChange}
          onUpdateRecord={onUpdateRecord}
          records={group.records}
          schema={schema}
        />
      </section>
    ))}</div>;
  }

  if (layout === 'chart' || layout === 'timeline' || layout === 'form') return <AdditionalViews
    key={activeView?.id}
    calculations={calculations}
    groups={groups}
    layout={layout}
    layoutConfig={activeView?.layoutConfig}
    schema={layout === 'timeline' ? schema : sourceSchema}
    records={records}
    locale={locale}
    onLayoutConfigChange={onLayoutConfigChange}
    onManageProperties={onManageProperties}
    onOpenRecord={onOpenRecord}
    onCreateRecord={onCreateRecord}
  />;

  switch (layout) {
    case 'gallery':
      return (
        <GalleryView
          coverPropertyId={activeView?.propertyState.coverPropertyId}
          locale={locale}
          onCoverPropertyChange={onCoverPropertyChange}
          onCreate={() => { void onCreateRecord({ databaseId, title: locale === 'ar' ? 'بدون عنوان' : 'Untitled' }).then((record) => { if (record) onOpenRecord(record); }); }}
          onOpenRecord={onOpenRecord}
          records={records}
          schema={sourceSchema}
          visibleSchema={schema}
        />
      );
    case 'board':
      return (
        <BoardView
          groupPropertyId={activeView?.group?.propertyId ?? activeView?.propertyState.groupPropertyId ?? undefined}
          databaseId={databaseId}
          onArchiveRecord={onArchiveRecord}
          onCreateRecord={onCreateRecord}
          onOpenRecord={onOpenRecord}
          onUpdateRecord={onUpdateRecord}
          locale={locale}
          onManageProperties={onManageProperties}
          records={records}
          schema={sourceSchema}
          visibleSchema={schema}
        />
      );

    case 'list':
    case 'map':
      return (
        <ListView
          databaseId={databaseId}
          locale={locale}
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
          datePropertyId={activeView?.propertyState.datePropertyId}
          locale={locale}
          onDatePropertyChange={onDatePropertyChange}
          databaseId={databaseId}
          onArchiveRecord={onArchiveRecord}
          onCreateRecord={onCreateRecord}
          onOpenRecord={onOpenRecord}
          records={records}
          schema={sourceSchema}
        />
      );

    case 'table':
    default:
      return (
        <TableView
          key={activeView?.id}
          canReorder={!activeView?.group && !activeView?.propertyState.groupPropertyId}
          hasSorting={!!activeView?.sorts.length}
          columns={activeView?.propertyState.columns}
          onColumnResize={onColumnResize}
          onPropertyMove={onPropertyMove}
          onRemoveSorting={onRemoveSorting}
          onManageProperties={onManageProperties} onEditProperty={onEditProperty}
          calculations={calculations}
          totalCount={totalCount}
          databaseId={databaseId}
          loading={loading}
          locale={locale}
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
