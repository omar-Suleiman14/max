import { useEffect, useMemo, useState } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { MapPoint, MapProviderStatus } from '../../shared/map-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';
import type { MapLayoutConfig } from '../../shared/view-contract';
import type { Locale } from '../app/i18n';
import { ListView } from './ListView';
import { parseMapPoint } from './map-utils';

type MapViewProps = Readonly<{
  databaseId: string;
  layoutConfig?: Readonly<Record<string, unknown>>;
  locale?: Locale;
  onArchiveRecord: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onLayoutConfigChange?: (layoutConfig: Readonly<Record<string, unknown>>) => void;
  onManageProperties?: () => void;
  onOpenRecord: (record: WorkspaceRecord) => void;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
}>;

type MappedRecord = Readonly<{ point: MapPoint; record: WorkspaceRecord }>;

const WIDTH = 900;
const HEIGHT = 480;
const ZOOM = 11;
const TILE_SIZE = 256;

function mapObject(layoutConfig: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const map = layoutConfig.map;
  return map && typeof map === 'object' && !Array.isArray(map)
    ? map as Readonly<Record<string, unknown>>
    : {};
}

function readMapConfig(layoutConfig: Readonly<Record<string, unknown>>): MapLayoutConfig {
  const map = mapObject(layoutConfig);
  return {
    disclosureAccepted: map.disclosureAccepted === true,
    locationPropertyId: typeof map.locationPropertyId === 'string' ? map.locationPropertyId : null,
  };
}

function worldPoint(point: MapPoint): Readonly<{ x: number; y: number }> {
  const scale = TILE_SIZE * 2 ** ZOOM;
  const latitude = Math.min(85.05112878, Math.max(-85.05112878, point.latitude));
  const sin = Math.sin(latitude * Math.PI / 180);
  return {
    x: (point.longitude + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function markerPosition(point: MapPoint, center: MapPoint): Readonly<{ left: number; top: number }> {
  const p = worldPoint(point);
  const c = worldPoint(center);
  return {
    left: WIDTH / 2 + (p.x - c.x),
    top: HEIGHT / 2 + (p.y - c.y),
  };
}

function FallbackList({ label, ...props }: { label: string } & Omit<MapViewProps, 'layoutConfig' | 'onLayoutConfigChange' | 'onManageProperties'>) {
  return <section className="database-map-fallback">
    <p role="status">{label}</p>
    <ListView {...props} />
  </section>;
}

export function MapView({
  databaseId,
  layoutConfig = {},
  locale = 'en',
  onArchiveRecord,
  onCreateRecord,
  onLayoutConfigChange,
  onManageProperties,
  onOpenRecord,
  records,
  schema,
}: MapViewProps) {
  const ar = locale === 'ar';
  const config = readMapConfig(layoutConfig);
  const textProperties = schema?.properties.filter((property) => property.type === 'text') ?? [];
  const locationProperty = textProperties.find((property) => property.id === config.locationPropertyId) ?? textProperties[0];
  const [provider, setProvider] = useState<MapProviderStatus | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mapped = useMemo(() => {
    if (!locationProperty) return [] as MappedRecord[];
    return records.flatMap((record) => {
      const point = parseMapPoint(record.properties[locationProperty.id]);
      return point ? [{ point, record }] : [];
    });
  }, [locationProperty, records]);
  const mappedIds = useMemo(() => new Set(mapped.map(({ record }) => record.id)), [mapped]);
  const unmapped = useMemo(() => records.filter((record) => !mappedIds.has(record.id)), [mappedIds, records]);
  const center = useMemo<MapPoint | null>(() => mapped.length === 0 ? null : ({
    latitude: mapped.reduce((sum, item) => sum + item.point.latitude, 0) / mapped.length,
    longitude: mapped.reduce((sum, item) => sum + item.point.longitude, 0) / mapped.length,
  }), [mapped]);
  const mapsApi = window.maxApi?.maps;

  const saveConfig = (next: MapLayoutConfig) => {
    onLayoutConfigChange?.({
      ...layoutConfig,
      map: { ...mapObject(layoutConfig), ...next },
    });
  };

  useEffect(() => {
    let active = true;
    if (!mapsApi) {
      setProvider({ configured: false, disclosure: '', providerName: 'Unavailable' });
      return () => { active = false; };
    }
    void mapsApi.getStatus().then((status) => {
      if (active) setProvider(status);
    }).catch(() => {
      if (active) setProvider({ configured: false, disclosure: '', providerName: 'Unavailable' });
    });
    return () => { active = false; };
  }, [mapsApi]);

  useEffect(() => {
    let active = true;
    setImage(null);
    setError(null);
    if (!mapsApi || !provider?.configured || !config.disclosureAccepted || !locationProperty || mapped.length === 0) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void mapsApi.render(mapped.map(({ point }) => point)).then((result) => {
      if (!active) return;
      if (result.ok) setImage(result.value.imageDataUrl);
      else setError(result.error.message);
    }).catch(() => {
      if (active) setError(ar ? 'تعذر الوصول إلى موفر الخريطة.' : 'Could not reach the map provider.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [ar, config.disclosureAccepted, locationProperty, mapped, mapsApi, provider?.configured]);

  const listProps = { databaseId, locale, onArchiveRecord, onCreateRecord, onOpenRecord, records, schema };
  if (!schema) return null;
  if (!locationProperty) {
    return <section className="database-map" dir={ar ? 'rtl' : 'ltr'}>
      <div className="database-map__notice">
        <p>{ar ? 'أضف خاصية نصية تحتوي على الإحداثيات بالشكل: خط العرض، خط الطول.' : 'Add a Text property containing coordinates as: latitude, longitude.'}</p>
        {onManageProperties && <button type="button" onClick={onManageProperties}>{ar ? 'إضافة خاصية نصية' : 'Add Text property'}</button>}
      </div>
      <ListView {...listProps} />
    </section>;
  }

  if (!mapsApi || (provider && !provider.configured)) {
    return <FallbackList {...listProps} label={ar ? 'الخريطة غير متاحة الآن. يمكنك متابعة استخدام السجلات في عرض القائمة.' : 'Map rendering is unavailable. You can keep using these records in List view.'} />;
  }

  const select = <label className="database-map__property">
    <span>{ar ? 'خاصية الموقع' : 'Location property'}</span>
    <select value={locationProperty.id} onChange={(event) => saveConfig({ ...config, locationPropertyId: event.target.value })}>
      {textProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
    </select>
  </label>;

  if (!config.disclosureAccepted) {
    return <section className="database-map" dir={ar ? 'rtl' : 'ltr'}>
      {select}
      <div className="database-map__notice">
        <strong>{ar ? 'قبل عرض الخريطة' : 'Before showing the map'}</strong>
        <p>{provider?.disclosure || (ar ? 'سيتم إرسال الإحداثيات فقط إلى موفر الخريطة.' : 'Only coordinates will be sent to the map provider.')}</p>
        <button type="button" onClick={() => saveConfig({ ...config, disclosureAccepted: true, locationPropertyId: locationProperty.id })}>
          {ar ? 'متابعة وعرض الخريطة' : 'Continue and show map'}
        </button>
      </div>
      <ListView {...listProps} />
    </section>;
  }

  if (mapped.length === 0) {
    return <section className="database-map" dir={ar ? 'rtl' : 'ltr'}>
      {select}
      <div className="database-map__notice" role="status">{ar ? 'لا توجد إحداثيات صالحة في هذه الخاصية.' : 'No valid coordinates were found in this property.'}</div>
      <ListView {...listProps} />
    </section>;
  }

  if (error) return <FallbackList {...listProps} label={`${ar ? 'تعذر عرض الخريطة' : 'Could not render map'}: ${error}`} />;

  return <section className="database-map" dir={ar ? 'rtl' : 'ltr'}>
    <div className="database-map__toolbar">{select}<span>{provider?.providerName}</span></div>
    <div className="database-map__canvas" aria-busy={loading || undefined}>
      {loading && <p role="status">{ar ? 'جارٍ تحميل الخريطة…' : 'Loading map…'}</p>}
      {image && center && <>
        <img alt="" src={image} />
        <div className="database-map__markers" aria-label={ar ? 'سجلات الخريطة' : 'Map records'}>
          {mapped.map(({ point, record }) => {
            const position = markerPosition(point, center);
            if (position.left < 0 || position.left > WIDTH || position.top < 0 || position.top > HEIGHT) return null;
            return <button
              aria-label={record.title}
              className="database-map__marker"
              key={record.id}
              onClick={() => onOpenRecord(record)}
              style={{ left: `${position.left / WIDTH * 100}%`, top: `${position.top / HEIGHT * 100}%` }}
              title={record.title}
              type="button"
            ><span>{record.title}</span></button>;
          })}
        </div>
      </>}
    </div>
    {unmapped.length > 0 && <div className="database-map__unmapped">
      <h3>{ar ? 'سجلات بدون إحداثيات صالحة' : 'Records without valid coordinates'}</h3>
      <ListView {...listProps} records={unmapped} />
    </div>}
  </section>;
}
