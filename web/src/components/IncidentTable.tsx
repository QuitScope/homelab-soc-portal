import { ArrowDown, ArrowUp } from 'lucide-react';
import { Link } from 'react-router';
import type { Incident } from '@/lib/types';
import { cn, fmtDateTime, incidentKey } from '@/lib/utils';
import { SeverityBadge, SimulatedBadge, StatusBadge } from './badges';
import { Table, Td, Th } from './ui/misc';

export type SortKey = 'created_at' | 'severity' | 'status' | 'title' | 'host';

export function IncidentTable({
  items,
  search,
  sort,
  order,
  onSort,
  compact,
}: {
  items: Incident[];
  search: string;
  sort?: SortKey;
  order?: 'asc' | 'desc';
  onSort?: (key: SortKey) => void;
  compact?: boolean;
}) {
  const head = (key: SortKey, label: string, className?: string) => (
    <Th className={className} aria-sort={sort === key ? (order === 'asc' ? 'ascending' : 'descending') : undefined}>
      {onSort ? (
        <button type="button" onClick={() => onSort(key)} className="inline-flex items-center gap-1 uppercase hover:text-fg">
          {label}
          {sort === key && (order === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
      ) : (
        label
      )}
    </Th>
  );
  return (
    <Table>
      <thead>
        <tr>
          <Th>ID</Th>
          {head('title', 'Titel')}
          {head('severity', 'Schweregrad')}
          {head('status', 'Status')}
          {head('host', 'Host', compact ? 'hidden 2xl:table-cell' : undefined)}
          {!compact && <Th className="hidden lg:table-cell">Benutzer / Quelle</Th>}
          {head('created_at', 'Zeit', 'text-right')}
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.id} className="group hover:bg-panel-3/60">
            <Td className="font-mono text-2xs text-fg-muted">
              <Link to={{ pathname: `/incidents/${i.id}`, search }} className="hover:text-primary" data-testid="incident-link">
                {incidentKey(i.id)}
              </Link>
            </Td>
            <Td className={cn('max-w-[18rem]', compact && 'max-w-[14rem]')}>
              <Link to={{ pathname: `/incidents/${i.id}`, search }} className="flex items-center gap-1.5 truncate font-medium group-hover:text-primary">
                <span className="truncate">{i.title}</span>
                {i.source === 'simulated' && <SimulatedBadge />}
              </Link>
            </Td>
            <Td><SeverityBadge severity={i.severity} /></Td>
            <Td><StatusBadge status={i.status} /></Td>
            <Td className={cn('text-fg-muted', compact && 'hidden 2xl:table-cell')}>{i.host ?? '–'}</Td>
            {!compact && (
              <Td className="hidden font-mono text-2xs text-fg-muted lg:table-cell">
                {[i.user, i.src].filter(Boolean).join(' · ') || '–'}
              </Td>
            )}
            <Td className="whitespace-nowrap text-right text-fg-muted">{fmtDateTime(i.createdAt)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
