import { useEffect, useState } from 'react';
/** Local graph display state; never part of workspace blueprint data. */
export function useGraphState<T>(key: string, fallback: T): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try { const parsed: unknown = JSON.parse(localStorage.getItem(`max.graph.${key}`) ?? 'null');
      if (parsed !== null && typeof parsed === typeof fallback && Array.isArray(parsed) === Array.isArray(fallback)) return parsed as T;
    } catch { /* Use defaults if stored state is invalid. */ }
    return fallback;
  });
  useEffect(() => { try { localStorage.setItem(`max.graph.${key}`, JSON.stringify(value)); } catch { /* Optional device storage. */ } }, [key, value]);
  return [value, setValue];
}
