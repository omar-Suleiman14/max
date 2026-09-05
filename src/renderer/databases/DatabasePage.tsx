import { createExcelWorkbook, downloadExcel } from './excel-export';
import { Select } from '../ui/select';
import {
  ArrowDownAZ,
  Download,
  Calendar,
  ChevronDown,
  Database,
  Filter,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Table as TableIcon,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Locale } from '../app/i18n';
import type { WorkspaceProperty, WorkspaceRecord, WorkspaceRecordTemplate } from '../../shared/property-contract';
import type { ViewLayout } from '../../shared/view-contract';
import { DatabaseViewHost } from './DatabaseViewHost';
import { FilterBuilder } from './FilterBuilder';
import { PropertyEditor } from './PropertyEditor';
import { RecordDrawer } from './RecordDrawer';
import { SortBuilder } from './SortBuilder';
import { useDatabaseQuery } from './useDatabaseQuery';

type DatabasePageProps = Readonly<{
  databaseId: string;
  embedded?: boolean;
  initialViewId?: string;
  locale?: Locale;
  onOpenRecordId?: string | null;
}>;

export function DatabasePage({ databaseId, embedded = false, initialViewId, locale = 'en', onOpenRecordId }: DatabasePageProps) {
  const {
    activeView,
    archiveRecord,
    archiveProperty,
    calculations,
    createProperty,
    createRecord,
    createView,
    error,
    filterAst,
    group,
    groups,
    loading,
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

  const [exporting, setExporting] = useState(false);
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
  const [recordDrawerOpen, setRecordDrawerOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [propertyManagerOpen, setPropertyManagerOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<WorkspaceProperty | null>(null);
  const [addViewModalOpen, setAddViewModalOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewLayout, setNewViewLayout] = useState<ViewLayout>('table');
  const [recordTemplates, setRecordTemplates] = useState<readonly WorkspaceRecordTemplate[]>([]);
  const [newRecordMenuOpen, setNewRecordMenuOpen] = useState(false);
  const newRecordMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void window.maxApi.workspace.listRecordTemplates(databaseId).then((templates) => {
      if (active) setRecordTemplates(templates);
    });
    return () => { active = false; };
  }, [databaseId]);

  useEffect(() => {
    if (!newRecordMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (event.target instanceof Node && !newRecordMenuRef.current?.contains(event.target)) {
        setNewRecordMenuOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setNewRecordMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [newRecordMenuOpen]);

  useEffect(() => {
    if (!onOpenRecordId) return;
    const record = records.find((candidate) => candidate.id === onOpenRecordId);
    if (record) {
      setSelectedRecord(record);
      setRecordDrawerOpen(true);
    }
  }, [onOpenRecordId, records]);

  const handleOpenRecord = (record: WorkspaceRecord) => {
    setSelectedRecord(record);
    setRecordDrawerOpen(true);
  };

  async function handleCreateBlankRecord(templateId?: string) {
    const template = recordTemplates.find(({ id }) => id === templateId);
    const record = await createRecord({
      databaseId,
      properties: {},
      templateId: template?.id,
      title: template?.name ?? (locale === 'ar' ? 'بدون عنوان' : 'Untitled'),
    });
    if (record) handleOpenRecord(record);
  }

  const handleCreateNewView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim()) return;

    await createView({
      databaseId,
      layout: newViewLayout,
      name: newViewName.trim(),
    });

    setNewViewName('');
    setAddViewModalOpen(false);
  };

  const activeFilterCount = filterAst
    ? filterAst.kind === 'group'
      ? filterAst.conditions.length
      : 1
    : 0;

  const getViewIcon = (layout: ViewLayout) => {
    switch (layout) {
      case 'board':
        return LayoutGrid;
      case 'list':
        return List;
      case 'calendar':
        return Calendar;
      case 'table':
      default:
        return TableIcon;
    }
  };

  return (
    <div className="database-page-container" data-embedded={embedded}>
      <div className="database-page-header">
        <div className="database-title-row">
          <div className="database-title-copy">
            <Database aria-hidden="true" size={embedded ? 17 : 20} />
            <div>
              <h2 className="database-page-title">{schema?.database.title || (locale === 'ar' ? 'قاعدة بيانات' : 'Database')}</h2>
              <span>
                {locale === 'ar'
                  ? `${totalCount} سجل · ${schema?.properties.length || 0} خاصية`
                  : `${totalCount} ${totalCount === 1 ? 'record' : 'records'} · ${schema?.properties.length || 0} properties`}
              </span>
            </div>
          </div>
          <div className="database-create-actions">
            <div className="database-new-record-split" ref={newRecordMenuRef}>
              <button className="database-new-record-button" onClick={() => void handleCreateBlankRecord()} type="button">
                <Plus aria-hidden="true" size={15} />
                {locale === 'ar' ? 'جديد' : 'New'}
              </button>
              <button
                aria-expanded={newRecordMenuOpen}
                aria-haspopup="menu"
                aria-label={locale === 'ar' ? 'خيارات السجل الجديد' : 'New record options'}
                className="database-new-record-menu-button"
                onClick={() => setNewRecordMenuOpen((open) => !open)}
                type="button"
              >
                <ChevronDown aria-hidden="true" size={14} />
              </button>
              {newRecordMenuOpen && (
                <div className="database-new-record-menu" role="menu">
                  <button onClick={() => { setNewRecordMenuOpen(false); void handleCreateBlankRecord(); }} role="menuitem" type="button">
                    <Plus aria-hidden="true" size={15} />
                    <span>{locale === 'ar' ? 'سجل فارغ' : 'Blank record'}</span>
                  </button>
                  {recordTemplates.length > 0 && <div className="database-new-record-menu__label">{locale === 'ar' ? 'القوالب' : 'Templates'}</div>}
                  {recordTemplates.map((template) => (
                    <button key={template.id} onClick={() => { setNewRecordMenuOpen(false); void handleCreateBlankRecord(template.id); }} role="menuitem" type="button">
                      <span aria-hidden="true" className="database-new-record-menu__icon">{template.icon ?? '◫'}</span>
                      <span>{template.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="database-views-bar">
          <div className="database-views-tabs">
            {views.map((view) => {
              const Icon = getViewIcon(view.layout);
              const isActive = activeView?.id === view.id;

              return (
                <button
                  key={view.id}
                  type="button"
                  className={`database-view-tab ${isActive ? 'database-view-tab--active' : ''}`}
                  onClick={() => setActiveView(view)}
                >
                  <Icon size={14} className="mr-1.5" />
                  <span>{view.name}</span>
                </button>
              );
            })}

            <button
              type="button"
              className="database-view-tab text-muted hover:text-foreground"
              onClick={() => setAddViewModalOpen(true)}
              title={locale === 'ar' ? 'إضافة طريقة عرض' : 'Add a view'}
            >
              <Plus aria-hidden="true" size={14} /> {locale === 'ar' ? 'طريقة عرض' : 'View'}
            </button>
          </div>
        </div>

        {exportError && <p className="form-error" role="alert">{exportError}</p>}
        <div className="database-toolbar">
          <button className="btn btn-secondary btn-sm" disabled={exporting || !schema} onClick={() => void exportExcel()} type="button"><Download aria-hidden="true" size={14} />{exporting ? (locale === 'ar' ? 'جارٍ التصدير…' : 'Exporting…') : (locale === 'ar' ? 'تصدير Excel' : 'Export Excel')}</button>
          <div className="database-toolbar__search">
            <Search size={14} className="text-muted" />
            <input
              type="text"
              placeholder={locale === 'ar' ? 'ابحث في قاعدة البيانات…' : 'Search this database…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-clean text-xs"
            />
            {searchQuery && (
              <button type="button" className="btn-icon p-0.5" onClick={() => setSearchQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>

          <div className="database-toolbar__actions">
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
            <button className="database-tool-button" onClick={() => setPropertyManagerOpen(true)} type="button">
              <Settings aria-hidden="true" size={13} /> {locale === 'ar' ? 'الخصائص' : 'Properties'}
            </button>
            <button
              type="button"
              className="database-tool-button"
              data-active={activeFilterCount > 0}
              onClick={() => setFilterModalOpen(true)}
            >
              <Filter aria-hidden="true" size={13} />
              {locale === 'ar' ? 'تصفية' : 'Filter'}
              {activeFilterCount > 0 && <span className="badge badge-primary ml-1.5 text-2xs">{activeFilterCount}</span>}
            </button>

            <button
              type="button"
              className="database-tool-button"
              data-active={sorts.length > 0}
              onClick={() => setSortModalOpen(true)}
            >
              <ArrowDownAZ aria-hidden="true" size={13} />
              {locale === 'ar' ? 'ترتيب' : 'Sort'}
              {sorts.length > 0 && <span className="badge badge-primary ml-1.5 text-2xs">{sorts.length}</span>}
            </button>

            <button
              type="button"
              aria-label={locale === 'ar' ? 'تحديث قاعدة البيانات' : 'Refresh database'}
              className="database-refresh-button"
              onClick={() => void refresh()}
              title={locale === 'ar' ? 'تحديث' : 'Refresh'}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

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
          databaseId={databaseId}
          groups={groups}
          onArchiveRecord={archiveRecord}
          onCreateRecord={createRecord}
          onOpenRecord={handleOpenRecord}
          onUpdateRecord={updateRecord}
          records={records}
          schema={schema}
        />
      </div>

      {/* Modals & Drawers */}
      <RecordDrawer
        isOpen={recordDrawerOpen}
        locale={locale}
        onArchive={archiveRecord}
        onClose={() => {
          setRecordDrawerOpen(false);
          setSelectedRecord(null);
        }}
        onUpdate={updateRecord}
        record={selectedRecord}
        schema={schema}
      />

      <FilterBuilder
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
        <div className="modal-backdrop" onClick={() => setPropertyManagerOpen(false)} role="dialog" aria-modal="true">
          <div className="modal-container modal-sm" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{locale === 'ar' ? 'خصائص قاعدة البيانات' : 'Database properties'}</h3>
              <button type="button" className="btn-icon" onClick={() => setPropertyManagerOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body space-y-2">
              {schema?.properties.map((property) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-700 p-3" key={property.id}>
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => {
                      setEditingProperty(property);
                      setPropertyManagerOpen(false);
                      setPropertyModalOpen(true);
                    }}
                    type="button"
                  >
                    <span className="truncate font-medium">{property.name}</span>
                    <span className="badge badge-secondary text-2xs">{property.type}</span>
                  </button>
                  {property.type !== 'title' && (
                    <button
                      className="btn btn-ghost btn-xs text-danger"
                      onClick={() => void archiveProperty(property.id)}
                      type="button"
                    >
                      {locale === 'ar' ? 'أرشفة' : 'Archive'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditingProperty(null);
                  setPropertyManagerOpen(false);
                  setPropertyModalOpen(true);
                }}
                type="button"
              >
                <Plus size={14} className="mr-1.5" />
                {locale === 'ar' ? 'خاصية جديدة' : 'New property'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add View Modal */}
      {addViewModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddViewModalOpen(false)} role="dialog" aria-modal="true">
          <div className="modal-container modal-sm" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { void handleCreateNewView(e); }}>
              <div className="modal-header">
                <h3>New View</h3>
                <button type="button" className="btn-icon" onClick={() => setAddViewModalOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <div className="modal-body space-y-3">
                <div className="form-group">
                  <label className="form-label">View Name</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. All Items, Active Orders..."
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Layout</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: TableIcon, id: 'table', label: 'Table' },
                      { icon: LayoutGrid, id: 'board', label: 'Board' },
                      { icon: List, id: 'list', label: 'List' },
                      { icon: Calendar, id: 'calendar', label: 'Calendar' },
                    ].map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = newViewLayout === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`p-3 rounded-lg border text-left flex items-center gap-2 ${isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-neutral-700 bg-neutral-800 text-neutral-300'}`}
                          onClick={() => setNewViewLayout(opt.id as ViewLayout)}
                        >
                          <Icon size={16} />
                          <span className="text-sm font-medium">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAddViewModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create View
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
