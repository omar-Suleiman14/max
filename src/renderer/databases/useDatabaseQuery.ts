import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty, WorkspacePropertyDraft, WorkspacePropertyPatch, WorkspaceRecord, WorkspaceRecordDraft, WorkspaceRecordPatch } from '../../shared/property-contract';
import type { AggregateCalculation, DatabaseQueryParams, FilterNode, GroupRule, QueryCalculationResult, RecordGroup, SortRule } from '../../shared/query-contract';
import type { WorkspaceView, WorkspaceViewDraft, WorkspaceViewPatch } from '../../shared/view-contract';

export type UseDatabaseQueryResult = Readonly<{
  activeView: WorkspaceView | null;
  archiveProperty: (propertyId: string) => Promise<void>;
  archiveRecord: (recordId: string) => Promise<void>;
  archiveView: (viewId: string) => Promise<void>;
  calculations: readonly QueryCalculationResult[];
  createProperty: (draft: WorkspacePropertyDraft) => Promise<WorkspaceProperty | null>;
  createRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  createView: (draft: WorkspaceViewDraft) => Promise<WorkspaceView | null>;
  error: string | null;
  filterAst: FilterNode | null;
  group: GroupRule | null;
  groups: readonly RecordGroup[];
  loading: boolean;
  page: number;
  pageSize: number;
  records: readonly WorkspaceRecord[];
  refresh: () => Promise<void>;
  schema: DatabaseSchema | null;
  searchQuery: string;
  setActiveView: (view: WorkspaceView | null) => void;
  setFilterAst: (filter: FilterNode | null) => void;
  setGroup: (group: GroupRule | null) => void;
  setPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setSorts: (sorts: readonly SortRule[]) => void;
  sorts: readonly SortRule[];
  totalCount: number;
  updateProperty: (propertyId: string, patch: WorkspacePropertyPatch) => Promise<void>;
  updateRecord: (recordId: string, patch: WorkspaceRecordPatch) => Promise<void>;
  updateView: (viewId: string, patch: WorkspaceViewPatch) => Promise<void>;
  views: readonly WorkspaceView[];
}>;

export function useDatabaseQuery(databaseId: string, initialViewId?: string): UseDatabaseQueryResult {
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [views, setViews] = useState<readonly WorkspaceView[]>([]);
  const [activeView, setActiveView] = useState<WorkspaceView | null>(null);
  const [records, setRecords] = useState<readonly WorkspaceRecord[]>([]);
  const [calculations, setCalculations] = useState<readonly QueryCalculationResult[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterAst, setFilterAst] = useState<FilterNode | null>(null);
  const [sorts, setSorts] = useState<readonly SortRule[]>([]);
  const [group, setGroup] = useState<GroupRule | null>(null);
  const [groups, setGroups] = useState<readonly RecordGroup[]>([]);
  const [page, setPage] = useState<number>(0);
  const pageSize = 50;

  // 1. Load Database Schema and Views
  const loadMetadata = useCallback(async () => {
    if (!databaseId) return;
    try {
      const [fetchedSchema, databaseViews, requestedView] = await Promise.all([
        window.maxApi.workspace.getDatabaseSchema(databaseId),
        window.maxApi.workspace.listViews(databaseId),
        initialViewId ? window.maxApi.workspace.getView(initialViewId) : Promise.resolve(null),
      ]);
      const fetchedViews = requestedView?.databaseId === databaseId && requestedView.ownerType === 'block'
        ? [requestedView]
        : databaseViews;
      setSchema(fetchedSchema);
      setViews(fetchedViews);

      if (fetchedViews.length > 0) {
        const defaultView = fetchedViews.find((view) => view.id === initialViewId)
          ?? fetchedViews.find((view) => view.id === fetchedSchema.database.defaultViewId)
          ?? fetchedViews[0];
        setActiveView((previous) => initialViewId ? defaultView ?? null : previous ?? defaultView ?? null);
        if (defaultView?.filterAst) {
          setFilterAst(defaultView.filterAst);
        }
        if (defaultView?.sorts) {
          setSorts(defaultView.sorts);
        }
        setGroup(defaultView?.group ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load database schema.');
    }
  }, [databaseId, initialViewId]);

  // 2. Query Records based on current filters, sorts, pagination
  const fetchRecords = useCallback(async () => {
    if (!databaseId) return;
    setLoading(true);
    setError(null);

    try {
      const layoutCalculations: readonly AggregateCalculation[] =
        activeView?.layoutConfig &&
        typeof activeView.layoutConfig === 'object' &&
        'calculations' in activeView.layoutConfig &&
        Array.isArray(activeView.layoutConfig.calculations)
          ? (activeView.layoutConfig.calculations as readonly AggregateCalculation[])
          : [];

      const params: DatabaseQueryParams = {
        calculations: layoutCalculations,
        cursor: page > 0 ? String(page * pageSize) : undefined,
        databaseId,
        filter: filterAst || undefined,
        group: group ?? undefined,
        limit: pageSize,
        search: searchQuery.trim() || undefined,
        sorts: sorts.length > 0 ? sorts : undefined,
      };

      const res = await window.maxApi.workspace.queryDatabase(params);
      setRecords(res.records);
      setTotalCount(res.totalCount);
      setCalculations(res.calculations);
      setGroups(res.groups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query database.');
    } finally {
      setLoading(false);
    }
  }, [activeView, databaseId, filterAst, group, page, pageSize, searchQuery, sorts]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // View Switch
  const handleSetActiveView = useCallback((view: WorkspaceView | null) => {
    setActiveView(view);
    if (view) {
      setFilterAst(view.filterAst || null);
      setSorts(view.sorts || []);
      setGroup(view.group ?? null);
      setPage(0);
    }
  }, []);

  // CRUD Records
  const createRecord = useCallback(async (draft: WorkspaceRecordDraft): Promise<WorkspaceRecord | null> => {
    try {
      const res = await window.maxApi.workspace.createRecord(draft);
      if (res.ok) {
        await fetchRecords();
        return res.value;
      }
      setError(res.error.message);
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create record.');
      return null;
    }
  }, [fetchRecords]);

  const updateRecord = useCallback(async (recordId: string, patch: WorkspaceRecordPatch): Promise<void> => {
    try {
      // Optimistic update
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id !== recordId) return r;
          return {
            ...r,
            icon: patch.icon !== undefined ? patch.icon : r.icon,
            properties: { ...r.properties, ...(patch.properties || {}) },
            title: patch.title !== undefined ? patch.title : r.title,
          };
        }),
      );

      const res = await window.maxApi.workspace.updateRecord(recordId, patch);
      if (!res.ok) {
        setError(res.error.message);
        await fetchRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update record.');
      await fetchRecords();
    }
  }, [fetchRecords]);

  const archiveRecord = useCallback(async (recordId: string): Promise<void> => {
    try {
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      const res = await window.maxApi.workspace.archiveRecord(recordId);
      if (!res.ok) {
        setError(res.error.message);
        await fetchRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive record.');
      await fetchRecords();
    }
  }, [fetchRecords]);

  // CRUD Properties
  const createProperty = useCallback(async (draft: WorkspacePropertyDraft): Promise<WorkspaceProperty | null> => {
    try {
      const res = await window.maxApi.workspace.createProperty(draft);
      if (res.ok) {
        await loadMetadata();
        await fetchRecords();
        return res.value;
      }
      setError(res.error.message);
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create property.');
      return null;
    }
  }, [fetchRecords, loadMetadata]);

  const updateProperty = useCallback(async (propertyId: string, patch: WorkspacePropertyPatch): Promise<void> => {
    try {
      const res = await window.maxApi.workspace.updateProperty(propertyId, patch);
      if (res.ok) {
        await loadMetadata();
        await fetchRecords();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update property.');
    }
  }, [fetchRecords, loadMetadata]);

  const archiveProperty = useCallback(async (propertyId: string): Promise<void> => {
    try {
      const res = await window.maxApi.workspace.archiveProperty(propertyId);
      if (res.ok) {
        await loadMetadata();
        await fetchRecords();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive property.');
    }
  }, [fetchRecords, loadMetadata]);

  // CRUD Views
  const createView = useCallback(async (draft: WorkspaceViewDraft): Promise<WorkspaceView | null> => {
    try {
      const res = await window.maxApi.workspace.createView(draft);
      if (res.ok) {
        await loadMetadata();
        setActiveView(res.value);
        return res.value;
      }
      setError(res.error.message);
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create view.');
      return null;
    }
  }, [loadMetadata]);

  const updateView = useCallback(async (viewId: string, patch: WorkspaceViewPatch): Promise<void> => {
    try {
      const res = await window.maxApi.workspace.updateView(viewId, patch);
      if (res.ok) {
        await loadMetadata();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update view.');
    }
  }, [loadMetadata]);

  const archiveView = useCallback(async (viewId: string): Promise<void> => {
    try {
      const res = await window.maxApi.workspace.archiveView(viewId);
      if (res.ok) {
        await loadMetadata();
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive view.');
    }
  }, [loadMetadata]);

  const refresh = useCallback(async () => {
    await Promise.all([loadMetadata(), fetchRecords()]);
  }, [fetchRecords, loadMetadata]);

  return useMemo(() => ({
    activeView,
    archiveProperty,
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
    records,
    refresh,
    schema,
    searchQuery,
    setActiveView: handleSetActiveView,
    setFilterAst,
    setGroup,
    setPage,
    setSearchQuery,
    setSorts,
    sorts,
    totalCount,
    updateProperty,
    updateRecord,
    updateView,
    views,
  }), [
    activeView,
    archiveProperty,
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
    handleSetActiveView,
    loading,
    page,
    pageSize,
    records,
    refresh,
    schema,
    searchQuery,
    sorts,
    totalCount,
    updateProperty,
    updateRecord,
    updateView,
    views,
  ]);
}
