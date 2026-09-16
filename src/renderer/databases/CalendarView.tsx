import { Select } from '../ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { Locale } from '../app/i18n';
import type { WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';

const COPY = {
  ar: { createdTime: 'وقت الإنشاء', dateBy: 'التاريخ حسب', next: 'الشهر التالي', previous: 'الشهر السابق', today: 'اليوم' },
  en: { createdTime: 'Created time', dateBy: 'Date by', next: 'Next month', previous: 'Previous month', today: 'Today' },
} as const;

type CalendarViewProps = Readonly<{
  databaseId: string;
  datePropertyId?: string | null;
  locale?: Locale;
  onDatePropertyChange?: (id: string) => void;
  onArchiveRecord?: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
}>;

export function CalendarView({
  databaseId,
  datePropertyId,
  locale = 'en',
  onDatePropertyChange,
  onCreateRecord,
  onOpenRecord,
  records,
  schema,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // Find date property (default to first date property or createdAt)
  const dateProperties = schema?.properties.filter((p) => p.type === 'date') || [];
  const [selectedDatePropId, setSelectedDatePropId] = useState<string>(
    datePropertyId || dateProperties[0]?.id || 'createdAt',
  );
  useEffect(() => { if (datePropertyId) setSelectedDatePropId(datePropertyId); }, [datePropertyId]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const copy = COPY[locale];
  // A hardcoded English month list left an Arabic workspace reading "September"
  // under a right to left page. The names come from the language instead.
  // Latin numerals even in Arabic: the day numbers in the cells come straight
  // from the date and are Latin, so an Arabic-Indic year above them would not
  // match, and the rest of Max counts in Latin digits too.
  const tag = locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
  const monthTitle = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric' }).format(currentDate);
  const weekdayName = new Intl.DateTimeFormat(tag, { weekday: 'short' });
  // Any week will do; this one starts on a Sunday, which is where the grid does.
  const daysOfWeek = Array.from({ length: 7 }, (_, day) => weekdayName.format(new Date(2026, 0, 4 + day)));

  // Calculate calendar days
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: { date: Date; dateString: string; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      days.push({
        date: d,
        dateString: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d,
        dateString: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill complete grid of 35 or 42
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: d,
        dateString: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [month, year]);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleAddOnDate = async (dateString: string) => {
    const title = locale === 'ar' ? 'بدون عنوان' : 'Untitled';

    const props: Record<string, unknown> = {};
    if (selectedDatePropId !== 'createdAt') {
      props[selectedDatePropId] = dateString;
    }

    const created = await onCreateRecord({
      databaseId,
      properties: props,
      title,
    });
    if (created) onOpenRecord(created);
  };

  return (
    <div className="calendar-view-container">
      {/* Calendar Header / Navigation */}
      <div className="calendar-header">
        <div className="flex items-center gap-2">
          <h3 className="calendar-header__title">{monthTitle}</h3>
          <div className="flex items-center rounded-md border border-neutral-700 overflow-hidden">
            <button type="button" className="btn-icon p-1.5" onClick={handlePrevMonth} title={copy.previous} aria-label={copy.previous}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="btn btn-ghost text-xs px-2.5 py-1" onClick={handleToday}>
              {copy.today}
            </button>
            <button type="button" className="btn-icon p-1.5" onClick={handleNextMonth} title={copy.next} aria-label={copy.next}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {dateProperties.length > 0 && (
          <div className="flex items-center gap-2">
            {/* No trailing colon: under RTL it detaches and renders as ":by". */}
            <span className="text-xs text-muted">{copy.dateBy}</span>
            <Select
              aria-label={copy.dateBy}
              className="select-field text-xs py-1"
              value={selectedDatePropId}
              onChange={(e) => { setSelectedDatePropId(e.target.value); onDatePropertyChange?.(e.target.value); }}
            >
              <option value="createdAt">{copy.createdTime}</option>
              {dateProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Weekday Labels */}
      <div className="calendar-weekdays">
        {daysOfWeek.map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="calendar-grid">
        {calendarDays.map((dayObj) => {
          const isToday = new Date().toDateString() === dayObj.date.toDateString();

          // Find records on this date
          const dayRecords = records.filter((r) => {
            if (selectedDatePropId === 'createdAt') {
              return new Date(r.createdAt).toDateString() === dayObj.date.toDateString();
            }
            const val = r.properties[selectedDatePropId];
            return typeof val === 'string' && val.slice(0, 10) === dayObj.dateString;
          });

          return (
            <div
              key={dayObj.dateString}
              className={`calendar-cell ${dayObj.isCurrentMonth ? '' : 'calendar-cell--other-month'} ${isToday ? 'calendar-cell--today' : ''}`}
              onClick={() => void handleAddOnDate(dayObj.dateString)}
            >
              <div className="calendar-cell__header">
                <span className={`calendar-cell__day ${isToday ? 'calendar-cell__day--today' : ''}`}>
                  {dayObj.date.getDate()}
                </span>
              </div>

              <div className="calendar-cell__records">
                {dayRecords.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    className="calendar-record-pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRecord(record);
                    }}
                  >
                    <span className="text-2xs font-mono opacity-60">#{record.sequence}</span>
                    <span className="truncate">{record.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
