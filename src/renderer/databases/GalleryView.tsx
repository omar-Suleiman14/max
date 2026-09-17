import { FileText, Plus } from 'lucide-react';
import { Select } from '../ui/select';
import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceProperty, WorkspaceRecord } from '../../shared/property-contract';
import type { Locale } from '../app/i18n';

/** A property that can hold a picture, and so can be a card's cover. */
const COVER_TYPES = ['file', 'url'];

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i;

/** In the browser preview the renderer is served over http, where `max:` has no handler. */
function displayUrl(value: string): string {
  return location.protocol === 'http:' || location.protocol === 'https:'
    ? value.replace('max://asset/', '/__max/asset/')
    : value;
}

/**
 * The first picture in a property value, or nothing.
 *
 * A file property holds a list of attachment urls, of which only some are
 * pictures, and a url property holds one string that may point at anything.
 */
function coverUrl(value: unknown): string | null {
  const candidates = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && IMAGE_FILE.test(candidate)) return displayUrl(candidate);
  }
  return null;
}

/**
 * The text a card shows under its title for one property.
 *
 * A choice is stored as an option id, so it has to be looked up rather than
 * printed, and a date arrives as an object rather than a day.
 */
function summarise(property: WorkspaceProperty, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const labelOf = (id: unknown) => property.options?.find((option) => option.id === id)?.label ?? '';
  switch (property.type) {
    case 'select':
    case 'status':
      return labelOf(value);
    case 'multi_select':
      return Array.isArray(value) ? value.map(labelOf).filter(Boolean).join(', ') : '';
    case 'checkbox':
      return value ? '✓' : '';
    case 'date': {
      if (typeof value === 'string') return value.slice(0, 10);
      const { start } = value as { start?: unknown };
      return typeof start === 'string' ? start.slice(0, 10) : '';
    }
    case 'file':
    case 'relation':
      return Array.isArray(value) && value.length > 0 ? String(value.length) : '';
    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
}

type GalleryViewProps = Readonly<{
  coverPropertyId?: string | null;
  locale: Locale;
  onCoverPropertyChange?: (propertyId: string) => void;
  onCreate: () => void;
  onOpenRecord: (record: WorkspaceRecord) => void;
  records: readonly WorkspaceRecord[];
  schema?: DatabaseSchema | null;
  visibleSchema?: DatabaseSchema | null;
}>;

export function GalleryView({
  coverPropertyId,
  locale,
  onCoverPropertyChange,
  onCreate,
  onOpenRecord,
  records,
  schema,
  visibleSchema,
}: GalleryViewProps) {
  const ar = locale === 'ar';
  const properties = schema?.properties ?? [];
  const coverChoices = properties.filter((property) => COVER_TYPES.includes(property.type));
  const cover = coverChoices.find((property) => property.id === coverPropertyId) ?? null;
  const summary: readonly WorkspaceProperty[] = (visibleSchema?.properties ?? properties)
    .filter((property) => property.type !== 'title' && property.id !== cover?.id)
    .slice(0, 3);

  return (
    <div className="database-gallery-view">
      {coverChoices.length > 0 && (
        <div className="database-gallery-toolbar">
          <span className="text-xs text-muted">{ar ? 'الغلاف:' : 'Cover:'}</span>
          <Select
            aria-label={ar ? 'خاصية الغلاف' : 'Cover property'}
            className="select-field text-xs py-1"
            value={cover?.id ?? ''}
            onChange={(event) => onCoverPropertyChange?.(event.target.value)}
          >
            <option value="">{ar ? 'بدون غلاف' : 'No cover'}</option>
            {coverChoices.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
          </Select>
        </div>
      )}

      <div className="database-gallery">
        {records.length === 0 && (
          <div className="database-gallery-empty" role="status">
            <FileText size={28} strokeWidth={1} />
            <p>{ar ? 'لا توجد سجلات بعد.' : 'No records yet.'}</p>
            <button className="btn btn-secondary" type="button" onClick={onCreate}>
              <Plus size={15} />{ar ? 'إنشاء أول صفحة' : 'Create first page'}
            </button>
          </div>
        )}
        {records.map((record) => {
          const picture = cover ? coverUrl(record.properties[cover.id]) : null;
          return (
            <button className="database-gallery-card" key={record.id} type="button" onClick={() => onOpenRecord(record)}>
              <div className="database-gallery-preview">
                {picture
                  ? <img alt="" className="database-gallery-image" src={picture} />
                  : <FileText size={32} strokeWidth={1} />}
              </div>
              <strong>{record.title}</strong>
              {summary.length > 0 && (
                <dl className="database-gallery-properties">
                  {summary.map((property) => {
                    const text = summarise(property, record.properties[property.id]);
                    if (!text) return null;
                    return (
                      <div key={property.id}>
                        <dt>{property.name}</dt>
                        <dd>{text}</dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </button>
          );
        })}
        {records.length > 0 && (
          <button className="database-gallery-new" type="button" onClick={onCreate}>
            <Plus size={17} />{ar ? 'صفحة جديدة' : 'New page'}
          </button>
        )}
      </div>
    </div>
  );
}
