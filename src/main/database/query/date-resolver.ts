import type { RelativeDatePeriod } from '../../../shared/query-contract';

export type ResolvedDateRange = Readonly<{
  endDate: string; // YYYY-MM-DD
  startDate: string; // YYYY-MM-DD
}>;

function formatYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveRelativeDate(period: RelativeDatePeriod, relativeValue = 0, baseDate = new Date()): ResolvedDateRange {
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();

  switch (period) {
    case 'TODAY': {
      const d = formatYMD(baseDate);
      return { endDate: d, startDate: d };
    }
    case 'YESTERDAY': {
      const y = new Date(Date.UTC(year, month, day - 1));
      const d = formatYMD(y);
      return { endDate: d, startDate: d };
    }
    case 'TOMORROW': {
      const t = new Date(Date.UTC(year, month, day + 1));
      const d = formatYMD(t);
      return { endDate: d, startDate: d };
    }
    case 'THIS_WEEK': {
      const dayOfWeek = baseDate.getUTCDay();
      const start = new Date(Date.UTC(year, month, day - dayOfWeek));
      const end = new Date(Date.UTC(year, month, day - dayOfWeek + 6));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'LAST_WEEK': {
      const dayOfWeek = baseDate.getUTCDay();
      const start = new Date(Date.UTC(year, month, day - dayOfWeek - 7));
      const end = new Date(Date.UTC(year, month, day - dayOfWeek - 1));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'NEXT_WEEK': {
      const dayOfWeek = baseDate.getUTCDay();
      const start = new Date(Date.UTC(year, month, day - dayOfWeek + 7));
      const end = new Date(Date.UTC(year, month, day - dayOfWeek + 13));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'THIS_MONTH': {
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'LAST_MONTH': {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'NEXT_MONTH': {
      const start = new Date(Date.UTC(year, month + 1, 1));
      const end = new Date(Date.UTC(year, month + 2, 0));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'THIS_QUARTER': {
      const qStartMonth = Math.floor(month / 3) * 3;
      const start = new Date(Date.UTC(year, qStartMonth, 1));
      const end = new Date(Date.UTC(year, qStartMonth + 3, 0));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'LAST_QUARTER': {
      const qStartMonth = Math.floor(month / 3) * 3 - 3;
      const start = new Date(Date.UTC(year, qStartMonth, 1));
      const end = new Date(Date.UTC(year, qStartMonth + 3, 0));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'NEXT_QUARTER': {
      const qStartMonth = Math.floor(month / 3) * 3 + 3;
      const start = new Date(Date.UTC(year, qStartMonth, 1));
      const end = new Date(Date.UTC(year, qStartMonth + 3, 0));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'THIS_YEAR': {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year, 11, 31));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'LAST_YEAR': {
      const start = new Date(Date.UTC(year - 1, 0, 1));
      const end = new Date(Date.UTC(year - 1, 11, 31));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'NEXT_YEAR': {
      const start = new Date(Date.UTC(year + 1, 0, 1));
      const end = new Date(Date.UTC(year + 1, 11, 31));
      return { endDate: formatYMD(end), startDate: formatYMD(start) };
    }
    case 'LAST_N_DAYS': {
      const count = relativeValue > 0 ? relativeValue : 7;
      const start = new Date(Date.UTC(year, month, day - count));
      return { endDate: formatYMD(baseDate), startDate: formatYMD(start) };
    }
    case 'NEXT_N_DAYS': {
      const count = relativeValue > 0 ? relativeValue : 7;
      const end = new Date(Date.UTC(year, month, day + count));
      return { endDate: formatYMD(end), startDate: formatYMD(baseDate) };
    }
    case 'LAST_N_WEEKS': {
      const count = relativeValue > 0 ? relativeValue : 1;
      const start = new Date(Date.UTC(year, month, day - count * 7));
      return { endDate: formatYMD(baseDate), startDate: formatYMD(start) };
    }
    case 'NEXT_N_WEEKS': {
      const count = relativeValue > 0 ? relativeValue : 1;
      const end = new Date(Date.UTC(year, month, day + count * 7));
      return { endDate: formatYMD(end), startDate: formatYMD(baseDate) };
    }
    case 'LAST_N_MONTHS': {
      const count = relativeValue > 0 ? relativeValue : 1;
      const start = new Date(Date.UTC(year, month - count, day));
      return { endDate: formatYMD(baseDate), startDate: formatYMD(start) };
    }
    case 'NEXT_N_MONTHS': {
      const count = relativeValue > 0 ? relativeValue : 1;
      const end = new Date(Date.UTC(year, month + count, day));
      return { endDate: formatYMD(end), startDate: formatYMD(baseDate) };
    }
    default: {
      const d = formatYMD(baseDate);
      return { endDate: d, startDate: d };
    }
  }
}
