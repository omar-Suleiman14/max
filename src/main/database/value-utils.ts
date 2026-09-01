export function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

export function dateValueToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'object' && value !== null && 'start' in value) {
    const start = value.start;
    return typeof start === 'string' ? start : '';
  }
  return '';
}

export function parseStoredJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
