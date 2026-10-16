import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useFilters } from '@/lib/filters';

const wrapper = (url: string) => ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;

describe('useFilters', () => {
  it('reads filters from the URL with 24h default and builds the API query', () => {
    const { result } = renderHook(() => useFilters(), { wrapper: wrapper('/?host=lab-linux-01&severity=high&page=3&sort=title') });
    expect(result.current.filters).toEqual({ range: '24h', host: 'lab-linux-01', severity: 'high' });
    expect(result.current.query).toBe('range=24h&host=lab-linux-01&severity=high');
    expect(result.current.active).toBe(2);
  });

  it('setting a filter resets pagination and removing it clears the key', () => {
    const { result } = renderHook(() => useFilters(), { wrapper: wrapper('/?range=7d&page=4') });
    act(() => result.current.setFilter('mitre', 'T1110.001'));
    expect(result.current.query).toBe('range=7d&mitre=T1110.001');
    act(() => result.current.setFilter('mitre', undefined));
    expect(result.current.filters).toEqual({ range: '7d' });
  });
});
