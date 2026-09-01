import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';

import type { DatabaseSchema } from '../../shared/database-contract';
import type { WorkspaceRecord, WorkspaceRecordDraft } from '../../shared/property-contract';

type CalendarViewProps = Readonly<{
  databaseId: string;
  onArchiveRecord?: (recordId: string) => Promise<void>;
  onCreateRecord: (draft: WorkspaceRecordDraft) => Promise<WorkspaceRecord | null>;
  onOpenRecord: (record: WorkspaceRecord) => void;
  records: readonly WorkspaceRecord[];
  schema: DatabaseSchema | null;
}>;

export function CalendarView({
  databaseId,
  onCreateRecord,
  onOpenRecord,
  records,
  schema,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // Find date property (default to first date property or createdAt)
  const dateProperties = schema?.properties.filter((p) => p.type === 'date') || [];
  const [selectedDatePropId, setSelectedDatePropId] = useState<string>(
    dateProperties[0]?.id || 'createdAt',
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
        dateString: d.toISOString().slice(0, 10),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d,
        dateString: d.toISOString().slice(0, 10),
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill complete grid of 35 or 42
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: d,
        dateString: d.toISOString().slice(0, 10),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [month, year]);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleAddOnDate = async (dateString: string) => {
    const title = window.prompt(`New record for ${dateString}:`);
    if (!title || !title.trim()) return;

    const props: Record<string, unknown> = {};
    if (selectedDatePropId !== 'createdAt') {
      props[selectedDatePropId] = dateString;
    }

    await onCreateRecord({
      databaseId,
      properties: props,
      title: title.trim(),
    });
  };

  return (
    <div className="calendar-view-container">
      {/* Calendar Header / Navigation */}
      <div className="calendar-header">
        <div className="flex items-center gap-2">
          <h3 className="calendar-header__title">
            {monthNames[month]} {year}
          </h3>
          <div className="flex items-center rounded-md border border-neutral-700 overflow-hidden">
            <button type="button" className="btn-icon p-1.5" onClick={handlePrevMonth} title="Previous month">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="btn btn-ghost text-xs px-2.5 py-1" onClick={handleToday}>
              Today
            </button>
            <button type="button" className="btn-icon p-1.5" onClick={handleNextMonth} title="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {dateProperties.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Date by:</span>
            <select
              className="select-field text-xs py-1"
              value={selectedDatePropId}
              onChange={(e) => setSelectedDatePropId(e.target.value)}
            >
              {dateProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
          const isToday = new Date().toISOString().slice(0, 10) === dayObj.dateString;

          // Find records on this date
          const dayRecords = records.filter((r) => {
            if (selectedDatePropId === 'createdAt') {
              return r.createdAt.slice(0, 10) === dayObj.dateString;
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
