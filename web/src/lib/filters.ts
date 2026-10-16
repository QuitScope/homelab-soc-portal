import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export const RANGE_OPTIONS = [
  { value: '1h', label: 'Letzte Stunde' },
  { value: '24h', label: 'Letzte 24 Stunden' },
  { value: '7d', label: 'Letzte 7 Tage' },
  { value: '30d', label: 'Letzte 30 Tage' },
] as const;

export const FILTER_KEYS = ['range', 'host', 'severity', 'mitre', 'q'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>> & { range: string };

/** Global filters live in the URL so they survive reloads and can be shared. */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<Filters>(() => {
    const f: Filters = { range: params.get('range') ?? '24h' };
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v && k !== 'range') f[k] = v;
    }
    return f;
  }, [params]);

  const setFilter = useCallback(
    (key: FilterKey, value: string | undefined) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  /** query string of the global filters only (for API calls and links) */
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) if (filters[k]) q.set(k, filters[k]!);
    return q.toString();
  }, [filters]);

  const active = FILTER_KEYS.filter((k) => k !== 'range' && filters[k]).length;
  return { filters, setFilter, query, active };
}
