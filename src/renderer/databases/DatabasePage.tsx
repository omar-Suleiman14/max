
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { DatabaseToolbar } from './DatabaseToolbar';
import './database.css';
import { createExcelWorkbook, downloadExcel } from './excel-export';
import { Select } from '../ui/select';
import { Plus, RefreshCw, X } from 'lucide-react';
import { PropertyIcon } from './PropertyIcon';
import { PageIconRenderer } from '../ui/page-icon-renderer';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Locale } from '../app/i18n';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty, WorkspaceRecord, WorkspaceRecordTemplate } from '../../shared/property-contract';
import { DatabaseSkeleton } from './DatabaseSkeleton';
import { DatabaseViewHost } from './DatabaseViewHost';
import { FilterBuilder } from './FilterBuilder';
import { PropertyEditor } from './PropertyEditor';
import { RecordDrawer } from './RecordDrawer';
import { SortBuilder } from './SortBuilder';
import { useDatabaseQuery } from './useDatabaseQuery';
import { recordDefaultsForFilter } from './view-defaults';

type DatabasePageProps = Readonly<{
  databaseId: string;
  embedded?: boolean;
  initialViewId?: string;
  locale?: Locale;
  onOpenRecordId?: string | null;
  onArchived?: () => void;
  onRemoveEmbeddedView?: () => void;
}>;

export function DatabasePage({ databaseId, embedded = false, initialViewId, locale = 'en', onOpenRecordId, onArchived, onRemoveEmbeddedView }: DatabasePageProps) {
  const {
    activeView,
    archiveRecord,
    archiveView,
    calculations,
    createProperty,
    createRecord,
    createView,
    error,
    filterAst,
    group,
    groups,
    loading,
    page,
    pageSize,
    setPage,
    records,
    refresh,
    schema,
    searchQuery,
    setActiveView,
    setFilterAst,
    setGroup,
    setSearchQuery,
    setSorts,
    sorts,
    totalCount,
    updateRecord,
    updateProperty,
    updateView,
    views,
  } = useDatabaseQuery(databaseId, initialViewId);

  /**
   * Create through the active view, not around it. A record added from a
   * filtered view is seeded with the values that filter asks for, so the new row
   * appears where it was asked for instead of being written and then hidden.
   */
  const createRecordInView = useCallback(
    (draft: Parameters<typeof createRecord>[0]) => createRecord({
      ...draft,
      properties: { ...recordDefaultsForFilter(filterAst, schema?.properties ?? []), ...draft.properties },
    }),
    [createRecord, filterAst, schema?.properties],
  );

  const [exporting, setExporting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () => { void window.maxApi.workspace.getNode(databaseId).then((node) => { if (active) setUnavailable(!node || !!node.archivedAt); }).catch(() => undefined); };
    check();
    window.addEventListener('max:workspace-changed', check);
    return () => { active = false; window.removeEventListener('max:workspace-changed', check); };
  }, [databaseId]);
  const [exportError, setExportError] = useState<string>();
  async function exportExcel() {
    if (!schema || exporting) return;
    setExporting(true); setExportError(undefined);
    try {
      const all: WorkspaceRecord[] = [];
      let cursor: string | undefined;
      do {
        const result = await window.maxApi.workspace.queryDatabase({ databaseId, filter: filterAst, sorts, search: searchQuery, limit: 200, cursor });
        all.push(...result.records);
        if (all.length > 100_000) throw new Error(locale === 'ar' ? 'حدد الفلاتر لتصدير 100,000 سجل كحد أقصى.' : 'Narrow the filters to export at most 100,000 records.');
        if (result.hasMore && (!result.nextCursor || result.nextCursor === cursor)) throw new Error('Export pagination did not advance.');
        cursor = result.hasMore ? result.nextCursor ?? undefined : undefined;
      } while (cursor);
      downloadExcel(createExcelWorkbook(schema.database.title, schema.properties, all, locale === 'ar'), schema.database.title);
    } catch (error) { setExportError(error instanceof Error ? error.message : String(error)); }
    finally { setExporting(false); }
  }

  // Modals & Drawers
  const [selectedRecord, setSelectedRecord] = useState<WorkspaceRecord | null>(null);
  const [relatedSchema, setRelatedSchema] = useState<DatabaseSchema | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    const open = (event: Event) => {
      event.stopPropagation();
      const record = (event as CustomEvent<WorkspaceRecord>).detail;
      void window.maxApi.workspace.getDatabaseSchema(record.databaseId).then((recordSchema) => {
        setRelatedSchema(recordSchema);
        setSelectedRecord(record);
        setRecordDrawerOpen(true);
      });
    };
    container?.addEventListener('max:open-record', open);
    return () => container?.removeEventListener('max:open-record', open);
  }, []);
  const [recordDrawerOpen, setRecordDrawerOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [propertyManagerOpen, setPropertyManagerOpen] = useState(false);
  const propertiesPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!propertyManagerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (propertiesPanelRef.current && !propertiesPanelRef.current.contains(event.target as Node)) {
        setPropertyManagerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [propertyManagerOpen]);
  const [dragProperty, setDragProperty] = useState<string>();
  const [editingProperty, setEditingProperty] = useState<WorkspaceProperty | null>(null);
  const [recordTemplates, setRecordTemplates] = useState<readonly WorkspaceRecordTemplate[]>([]);

  useEffect(() => {
    let active = true;
    const refreshTemplates = () => {
      void window.maxApi.workspace.listRecordTemplates(databaseId).then((templates) => {
        if (active) setRecordTemplates(templates);
      });
    };
    refreshTemplates();
    window.addEventListener('max:workspace-changed', refreshTemplates);
    return () => { active = false; window.removeEventListener('max:workspace-changed', refreshTemplates); };
  }, [databaseId]);

  useEffect(() => {
    if (!onOpenRecordId) return;
    let active = true;
    void window.maxApi.workspace.getRecord(onOpenRecordId).then((record) => {
      if (record && active && record.databaseId === databaseId) {
        setRelatedSchema(null);
        setSelectedRecord(record);
        setRecordDrawerOpen(true);
      }
    });
    return () => { active = false; };
  }, [databaseId, onOpenRecordId]);

  const handleOpenRecord = (record: WorkspaceRecord) => {
    setRelatedSchema(null);
    setSelectedRecord(record);
    setRecordDrawerOpen(true);
  };

  async function handleCreateBlankRecord(templateId?: string) {
    const template = recordTemplates.find(({ id }) => id === templateId);
    const record = await createRecordInView({
      databaseId,
      properties: {},
      templateId: template?.id,
      title: template?.name ?? (locale === 'ar' ? 'بدون عنوان' : 'Untitled'),
    });
    if (record) handleOpenRecord(record);
  }

  const activeFilterCount = filterAst
    ? filterAst.kind === 'group'
      ? filterAst.conditions.length
      : 1
    : 0;
  const orderedProperties = [...(schema?.properties ?? [])].sort((a, b) => {
    const columns = activeView?.propertyState.columns ?? [];
    if (columns.length < (schema?.properties.length ?? 0)) return 0;
    return columns.findIndex((column) => column.propertyId === a.id) - columns.findIndex((column) => column.propertyId === b.id);
  });
  function moveProperty(id: string, direction: number) {
    if (!activeView) return;
    const columns = orderedProperties.map((property) => ({ ...activeView.propertyState.columns.find((column) => column.propertyId === property.id), propertyId: property.id }));
    const index = columns.findIndex((column) => column.propertyId === id);
    const target = index + direction;
    const source = columns[index], destination = columns[target];
    if (!source || !destination) return;
    columns[index] = destination; columns[target] = source;
    void updateView(activeView.id, { propertyState: { ...activeView.propertyState, columns } });
  }

  useEffect(() => {
    if (schema?.database.archivedAt) {
      onArchived?.();
    }
  }, [schema?.database.archivedAt, onArchived]);

  if (unavailable || schema?.database.archivedAt) {
    if (embedded) return null;
    return <div className="database-page-container"><p style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>{locale === 'ar' ? 'هذه القاعدة مؤرشفة.' : 'This database has been archived.'}</p></div>;
  }

  return (
    <div ref={containerRef} className="database-page-container" data-embedded={embedded} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="notion-db-heading"><PageIconRenderer icon={schema?.database.icon ?? 'lucide:Database'} size={embedded ? 20 : 32} /><h2 contentEditable suppressContentEditableWarning aria-label={locale === 'ar' ? 'اسم قاعدة البيانات' : 'Database name'} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} onBlur={(event) => {
        const title = event.currentTarget.textContent?.trim();
        if (!title || title === schema?.database.title) { event.currentTarget.textContent = schema?.database.title ?? ''; return; }
        void window.maxApi.workspace.updateDatabase(databaseId, { title }).then((result) => {
          if (!result.ok) { setExportError(result.error.message); return; }
          window.dispatchEvent(new Event('max:workspace-changed'));
        }).catch((cause: unknown) => setExportError(String(cause)));
      }}>{schema?.database.title}</h2></div>
      <DatabaseToolbar locale={locale} databaseId={databaseId} activeView={activeView} views={views} templates={recordTemplates}
        embedded={embedded} onRemoveEmbeddedView={onRemoveEmbeddedView}
        onArchived={() => { setUnavailable(true); onArchived?.(); }}
        search={searchQuery} onSearch={setSearchQuery} onSelectView={setActiveView} filterCount={activeFilterCount} sortCount={sorts.length}
        onCreate={(templateId) => { void handleCreateBlankRecord(templateId); }} onCreateView={createView} onUpdateView={updateView} onArchiveView={archiveView}
        onFilter={() => setFilterModalOpen(true)} onSort={() => setSortModalOpen(true)} onProperties={() => setPropertyManagerOpen((open) => !open)} onExport={() => { void exportExcel(); }}
        grouping={<>
          <Select
            aria-label={locale === 'ar' ? 'تجميع حسب' : 'Group by'}
            className="database-toolbar-select"
            onChange={(event) => {
              const propertyId = event.target.value;
              const next = propertyId ? { propertyId } : null;
              setGroup(next);
              if (activeView) void updateView(activeView.id, { group: next });
            }}
            value={group?.propertyId ?? ''}
          >
            <option value="">{locale === 'ar' ? 'بدون تجميع' : 'No grouping'}</option>
            {schema?.properties.filter((property) => !['formula', 'relation', 'rollup'].includes(property.type)).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </Select>
          {group && schema?.properties.find((property) => property.id === group.propertyId)?.type === 'date' && (
            <Select
              aria-label={locale === 'ar' ? 'دقة تجميع التاريخ' : 'Date grouping'}
              className="database-toolbar-select"
              onChange={(event) => {
                const next = { ...group, dateGranularity: event.target.value as 'day' | 'week' | 'month' | 'quarter' | 'year' };
                setGroup(next);
                if (activeView) void updateView(activeView.id, { group: next });
              }}
              value={group.dateGranularity ?? 'month'}
            >
              {(['day', 'week', 'month', 'quarter', 'year'] as const).map((period) => (
                <option key={period} value={period}>{locale === 'ar' ? ({ day: 'يوم', week: 'أسبوع', month: 'شهر', quarter: 'ربع سنة', year: 'سنة' } as const)[period] : period}</option>
              ))}
            </Select>
          )}

        </>}
      />
      {exportError && <p className="form-error" role="alert">{exportError}</p>}
      {/* Error alert */}
      {error && (
        <div className="alert alert-danger m-4">
          <span>{error}</span>
          <button type="button" className="btn-icon ml-auto p-0.5" onClick={() => { void refresh(); }}>
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {/* Main View Grid / Board / List Host */}
      <div className="database-page-content">
        <DatabaseViewHost
          activeView={activeView}
          calculations={calculations}
          totalCount={totalCount}
          databaseId={databaseId}
          groups={groups}
          loading={loading}
          locale={locale}
          onArchiveRecord={archiveRecord}
          onCreateRecord={createRecordInView}
          onOpenRecord={handleOpenRecord}
          onUpdateRecord={updateRecord}
          onManageProperties={() => setPropertyManagerOpen((open) => !open)}
          onEditProperty={(property) => { setEditingProperty(property); setPropertyModalOpen(true); }}
          onDatePropertyChange={(datePropertyId) => { if (activeView) void updateView(activeView.id, { propertyState: { ...activeView.propertyState, datePropertyId } }); }}
          onRemoveSorting={async () => {
            if (!activeView) return;
            const result = await window.maxApi.workspace.updateView(activeView.id, { sorts: [] });
            if (!result.ok) throw new Error(result.error.message);
            await updateView(activeView.id, { sorts: [] });
          }}
          onPropertyMove={(source, target) => {
            if (!activeView || source === target) return;
            const columns = orderedProperties.map((property) => ({ ...activeView.propertyState.columns.find((column) => column.propertyId === property.id), propertyId: property.id }));
            const index = columns.findIndex((column) => column.propertyId === source);
            if (index < 0) return;
            const moved = columns.splice(index, 1)[0]!;
            const destination = columns.findIndex((column) => column.propertyId === target);
            if (destination < 0) return;
            columns.splice(destination + (index < destination + 1 ? 1 : 0), 0, moved);
            void updateView(activeView.id, { propertyState: { ...activeView.propertyState, columns } });
          }}
          onColumnResize={(propertyId, width) => {
            if (!activeView) return;
            const columns = activeView.propertyState.columns;
            const exists = columns.some((column) => column.propertyId === propertyId);
            void updateView(activeView.id, { propertyState: { ...activeView.propertyState, columns: exists ? columns.map((column) => column.propertyId === propertyId ? { ...column, width } : column) : [...columns, { propertyId, width }] } });
          }}
          records={records}
          schema={schema}
        />
        {/* The frame above is already on screen; only the rows are still coming. */}
        {!schema && <DatabaseSkeleton columns={4} embedded={embedded} locale={locale} rows={embedded ? 3 : 6} withFrame={false} />}
      </div>

      {totalCount > pageSize && <div className="database-pagination">
        <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} / {totalCount}</span>
        <button disabled={page === 0 || loading} onClick={() => setPage(page - 1)} type="button">{locale === 'ar' ? 'السابق' : 'Previous'}</button>
        <button disabled={(page + 1) * pageSize >= totalCount || loading} onClick={() => setPage(page + 1)} type="button">{locale === 'ar' ? 'التالي' : 'Next'}</button>
      </div>}
      {/* Modals & Drawers */}
      <RecordDrawer
        key={selectedRecord?.id}
        isOpen={recordDrawerOpen}
        locale={locale}
        pageMode={activeView?.layoutConfig.pageMode === 'full' || activeView?.layoutConfig.pageMode === 'center' || activeView?.layoutConfig.pageMode === 'side' ? activeView.layoutConfig.pageMode : 'center'}
        onArchive={archiveRecord}
        onClose={() => {
          setRecordDrawerOpen(false);
          setSelectedRecord(null);
        }}
        record={selectedRecord}
        schema={relatedSchema ?? schema}
      />

      <FilterBuilder
        locale={locale}
        filterAst={filterAst}
        isOpen={filterModalOpen}
        onApply={(filter) => {
          setFilterAst(filter);
          if (activeView) {
            void updateView(activeView.id, { filterAst: filter });
          }
        }}
        onClose={() => setFilterModalOpen(false)}
        properties={schema?.properties || []}
      />

      <SortBuilder
        locale={locale}
        isOpen={sortModalOpen}
        onApply={(newSorts) => {
          setSorts(newSorts);
          if (activeView) {
            void updateView(activeView.id, { sorts: newSorts });
          }
        }}
        onClose={() => setSortModalOpen(false)}
        properties={schema?.properties || []}
        sorts={sorts}
      />

      <PropertyEditor
        databaseId={databaseId}
        isOpen={propertyModalOpen}
        onClose={() => {
          setPropertyModalOpen(false);
          setEditingProperty(null);
        }}
        onSave={async (draftOrPatch) => {
          if ('databaseId' in draftOrPatch) {
            return createProperty(draftOrPatch);
          }
          if (editingProperty) await updateProperty(editingProperty.id, draftOrPatch);
          return null;
        }}
        property={editingProperty}
        schema={schema}
      />

      {propertyManagerOpen && (
        <div className="database-properties-panel" ref={propertiesPanelRef} onClick={(event) => event.stopPropagation()}>
          <div className="database-properties-panel__header">
            <h3>{locale === 'ar' ? 'خصائص قاعدة البيانات' : 'Properties'}</h3>
            <button type="button" className="btn-icon" onClick={() => setPropertyManagerOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="database-properties-panel__body">
            {orderedProperties.map((property, index) => {
              const isHidden = activeView?.propertyState.columns.find(c => c.propertyId === property.id)?.hidden;
              return (
                <div className="database-property-row" key={property.id} onDragOver={event => { if (dragProperty) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragProperty) moveProperty(dragProperty, index - orderedProperties.findIndex(p => p.id === dragProperty)); setDragProperty(undefined); }}>
                  <button type="button" className="btn-icon database-property-grip" draggable aria-label={"Reorder " + property.name} onDragStart={event => { setDragProperty(property.id); event.dataTransfer.setData("text/plain", property.id); }} onDragEnd={() => setDragProperty(undefined)}><GripVertical size={13} /></button>
                  <button
                    className="database-property-name"
                    onClick={() => {
                      setEditingProperty(property);
                      setPropertyManagerOpen(false);
                      setPropertyModalOpen(true);
                    }}
                    type="button"
                  >
                    <PropertyIcon type={property.type} icon={typeof property.config.icon === 'string' ? property.config.icon : undefined} />
                    <span className="truncate">{property.name}</span>
                  </button>
                  {property.type !== 'title' && activeView && (
                    <button type="button" className="btn-icon database-property-eye" aria-label={"Toggle visibility of " + property.name} aria-pressed={!isHidden} onClick={() => {
                      const columns = orderedProperties.map(candidate => ({ ...activeView.propertyState.columns.find(c => c.propertyId === candidate.id), propertyId: candidate.id }));
                      void updateView(activeView.id, { propertyState: { ...activeView.propertyState, columns: columns.map(c => c.propertyId === property.id ? { ...c, hidden: !c.hidden } : c) } });
                    }}>{isHidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="database-properties-panel__footer">
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                setEditingProperty(null);
                setPropertyManagerOpen(false);
                setPropertyModalOpen(true);
              }}
              type="button"
            >
              <Plus size={14} className="mr-1" />
              {locale === 'ar' ? 'خاصية جديدة' : 'New property'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
