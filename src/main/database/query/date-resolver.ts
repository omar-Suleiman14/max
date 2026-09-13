import type { RelativeDatePeriod } from '../../../shared/query-contract';

export type ResolvedDateRange = Readonly<{
  endDate: string; // YYYY-MM-DD, the last day of the range
  /** The instant the day after `endDate` begins, so a timestamp comparison stays exclusive at the top. */
  endInstant: string;
  startDate: string; // YYYY-MM-DD, the first day of the range
  /** The instant `startDate` begins. */
  startInstant: string;
}>;

/**
 * Relative periods are resolved on the machine's own calendar rather than on
 * UTC's. "Today" in Cairo is a different day from "today" in UTC for three
 * hours out of every twenty-four, and a shop that opens at eight and closes at
 * midnight would otherwise watch its own takings fall out of a Today filter.
 *
 * A date property holds a plain calendar day with no zone, so it is compared
 * against `startDate`/`endDate` directly. A timestamp property such as Created
 * time holds a UTC instant, so it is compared against `startInstant` and
 * `endInstant`, which are local midnight converted to UTC.
 */
function formatYMD(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function range(start: Date, end: Date): ResolvedDateRange {
  const dayAfterEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return {
    endDate: formatYMD(end),
    endInstant: dayAfterEnd.toISOString(),
    startDate: formatYMD(start),
    startInstant: new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString(),
  };
}

export function resolveRelativeDate(period: RelativeDatePeriod, relativeValue = 0, baseDate = new Date()): ResolvedDateRange {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();
  const local = (offsetMonths: number, offsetDays: number) => new Date(year, month + offsetMonths, day + offsetDays);
  const dayOfWeek = baseDate.getDay();

  switch (period) {
    case 'TODAY':
      return range(local(0, 0), local(0, 0));
    case 'YESTERDAY':
      return range(local(0, -1), local(0, -1));
    case 'TOMORROW':
      return range(local(0, 1), local(0, 1));
    case 'THIS_WEEK':
      return range(local(0, -dayOfWeek), local(0, -dayOfWeek + 6));
    case 'LAST_WEEK':
      return range(local(0, -dayOfWeek - 7), local(0, -dayOfWeek - 1));
    case 'NEXT_WEEK':
      return range(local(0, -dayOfWeek + 7), local(0, -dayOfWeek + 13));
    case 'THIS_MONTH':
      return range(new Date(year, month, 1), new Date(year, month + 1, 0));
    case 'LAST_MONTH':
      return range(new Date(year, month - 1, 1), new Date(year, month, 0));
    case 'NEXT_MONTH':
      return range(new Date(year, month + 1, 1), new Date(year, month + 2, 0));
    case 'THIS_QUARTER': {
      const quarterStart = Math.floor(month / 3) * 3;
      return range(new Date(year, quarterStart, 1), new Date(year, quarterStart + 3, 0));
    }
    case 'LAST_QUARTER': {
      const quarterStart = Math.floor(month / 3) * 3 - 3;
      return range(new Date(year, quarterStart, 1), new Date(year, quarterStart + 3, 0));
    }
    case 'NEXT_QUARTER': {
      const quarterStart = Math.floor(month / 3) * 3 + 3;
      return range(new Date(year, quarterStart, 1), new Date(year, quarterStart + 3, 0));
    }
    case 'THIS_YEAR':
      return range(new Date(year, 0, 1), new Date(year, 11, 31));
    case 'LAST_YEAR':
      return range(new Date(year - 1, 0, 1), new Date(year - 1, 11, 31));
    case 'NEXT_YEAR':
      return range(new Date(year + 1, 0, 1), new Date(year + 1, 11, 31));
    case 'LAST_N_DAYS':
      return range(local(0, -(relativeValue > 0 ? relativeValue : 7)), local(0, 0));
    case 'NEXT_N_DAYS':
      return range(local(0, 0), local(0, relativeValue > 0 ? relativeValue : 7));
    case 'LAST_N_WEEKS':
      return range(local(0, -(relativeValue > 0 ? relativeValue : 1) * 7), local(0, 0));
    case 'NEXT_N_WEEKS':
      return range(local(0, 0), local(0, (relativeValue > 0 ? relativeValue : 1) * 7));
    case 'LAST_N_MONTHS':
      return range(local(-(relativeValue > 0 ? relativeValue : 1), 0), local(0, 0));
    case 'NEXT_N_MONTHS':
      return range(local(0, 0), local(relativeValue > 0 ? relativeValue : 1, 0));
    default:
      return range(local(0, 0), local(0, 0));
  }
}
