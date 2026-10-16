import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Bot, FileText, LayoutDashboard, LogIn, LogOut, Network, PanelLeftClose, PanelLeftOpen, Radar, Search, Server, Settings, ShieldAlert, Siren, Workflow, X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RANGE_OPTIONS, useFilters } from '@/lib/filters';
import type { CoverageItem, HostStat } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SEVERITY_LABEL } from './badges';
import { Button } from './ui/button';
import { Input, Select } from './ui/misc';
import { Sheet } from './ui/sheet';
import { Tooltip } from './ui/tooltip';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/incidents', label: 'Incidents', icon: Siren },
  { to: '/detections', label: 'Erkennungsregeln', icon: ShieldAlert },
  { to: '/hosts', label: 'Hosts', icon: Server },
  { to: '/network', label: 'Netzwerk', icon: Network },
  { to: '/pipelines', label: 'Pipelines', icon: Workflow },
  { to: '/soar', label: 'SOAR', icon: Bot },
  { to: '/threat-intel', label: 'Threat Intelligence', icon: Radar },
  { to: '/reports', label: 'Berichte', icon: FileText },
];

function Logo() {
  return (
    <div className="grid size-9 grid-cols-2 gap-0.5 p-1.5" aria-label="Homelab SOC Portal">
      <span className="rounded-[3px] bg-primary" />
      <span className="rounded-[3px] bg-primary/70" />
      <span className="rounded-[3px] bg-primary/70" />
      <span className="rounded-[3px] bg-petrol" />
    </div>
  );
}

const ITEM =
  'flex h-9 shrink-0 items-center gap-3 rounded-lg text-fg-subtle transition-colors hover:bg-panel-3 hover:text-fg aria-[current=page]:glow aria-[current=page]:bg-petrol-dim/60 aria-[current=page]:text-primary';

function NavItem({ to, label, icon: Icon, expanded = false }: (typeof NAV)[number] & { expanded?: boolean }) {
  const { query } = useFilters();
  // static className: the Radix tooltip Slot cannot merge NavLink's className function; active state via aria-current
  const link = (
    <NavLink to={{ pathname: to, search: query }} end={to === '/'} aria-label={label} className={cn(ITEM, expanded ? 'w-full px-2.5' : 'w-9 justify-center')}>
      <Icon className="size-[17px] shrink-0" />
      {expanded && <span className="truncate text-xs font-medium">{label}</span>}
    </NavLink>
  );
  return expanded ? link : <Tooltip content={label} side="right">{link}</Tooltip>;
}

const SIDEBAR_KEY = 'soc.sidebar.expanded';
const readExpanded = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
};

export function Sidebar() {
  const [expanded, setExpanded] = useState(readExpanded);
  const toggle = () =>
    setExpanded((v) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, v ? '0' : '1');
      } catch {
        // storage blocked: state just is not remembered
      }
      return !v;
    });
  const Toggle = expanded ? PanelLeftClose : PanelLeftOpen;
  return (
    <nav
      aria-label="Hauptnavigation"
      className={cn(
        'no-print panel sticky top-3 hidden h-[calc(100vh-1.5rem)] shrink-0 flex-col gap-1.5 py-3 transition-[width] duration-200 md:flex',
        expanded ? 'w-52 items-stretch px-2.5' : 'w-14 items-center',
      )}
    >
      <div className="flex items-center gap-2">
        <Logo />
        {expanded && <span className="truncate text-[13px] font-semibold text-fg">SOC Portal</span>}
      </div>
      <div className={cn('my-2 h-px bg-border', expanded ? 'w-full' : 'w-7')} />
      {NAV.map((n) => (
        <NavItem key={n.to} {...n} expanded={expanded} />
      ))}
      <div className="flex-1" />
      <NavItem to="/settings" label="Einstellungen" icon={Settings} expanded={expanded} />
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={expanded ? 'Navigation einklappen' : 'Navigation ausklappen'}
        title={expanded ? 'Navigation einklappen' : 'Navigation ausklappen'}
        className={cn(ITEM, 'cursor-pointer', expanded ? 'w-full px-2.5' : 'w-9 justify-center')}
      >
        <Toggle className="size-[17px] shrink-0" />
        {expanded && <span className="text-xs">Einklappen</span>}
      </button>
    </nav>
  );
}

function MobileNav() {
  return (
    <nav className="no-print panel flex gap-1 overflow-x-auto p-1.5 md:hidden">
      {[...NAV, { to: '/settings', label: 'Einstellungen', icon: Settings }].map((n) => (
        <NavItem key={n.to} {...n} />
      ))}
    </nav>
  );
}

function LoginButton() {
  const { user, authConfigured, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: 'admin', password: '' });
  if (user) {
    return (
      <Tooltip content={`Angemeldet als ${user} – abmelden`}>
        <Button variant="ghost" size="sm" onClick={() => logout.mutate()} aria-label="Abmelden">
          <span className="grid size-6 place-items-center rounded-full bg-petrol text-2xs font-semibold uppercase text-fg">{user[0]}</span>
          <LogOut />
        </Button>
      </Tooltip>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(form, { onSuccess: () => (setOpen(false), setForm((f) => ({ ...f, password: '' }))) });
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!authConfigured} title={authConfigured ? undefined : 'ADMIN_PASSWORD_HASH nicht gesetzt'}>
        <LogIn /> Anmelden
      </Button>
      <Sheet open={open} onOpenChange={setOpen} side="center" title="Anmelden" description="Single-User-Modus: nötig für Statusänderungen und Sync.">
        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1 text-2xs text-fg-muted">
            Benutzer
            <Input autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-2xs text-fg-muted">
            Passwort
            <Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus />
          </label>
          {login.error && <p className="text-2xs text-sev-critical" role="alert">{login.error.message}</p>}
          <Button variant="default" type="submit" disabled={login.isPending || !form.password}>
            Anmelden
          </Button>
        </form>
      </Sheet>
    </>
  );
}

function FilterBar() {
  const { filters, setFilter, active } = useFilters();
  const hosts = useQuery({ queryKey: ['host-options'], queryFn: () => api<{ items: HostStat[] }>('/hosts?range=30d'), staleTime: 300_000 });
  const mitre = useQuery({ queryKey: ['mitre-options'], queryFn: () => api<{ items: CoverageItem[] }>('/coverage?range=30d'), staleTime: 300_000 });
  const [q, setQ] = useState(filters.q ?? '');
  useEffect(() => setQ(filters.q ?? ''), [filters.q]);
  useEffect(() => {
    const t = setTimeout(() => q !== (filters.q ?? '') && setFilter('q', q.trim() || undefined), 350);
    return () => clearTimeout(t);
  }, [q, filters.q, setFilter]);

  const hostOptions = [...new Set([...(hosts.data?.items.map((h) => h.host) ?? []), ...(filters.host ? [filters.host] : [])])];
  return (
    <div className="no-print flex flex-wrap items-center gap-2" role="search" aria-label="Globale Filter">
      <Select aria-label="Zeitraum" value={filters.range} onChange={(e) => setFilter('range', e.target.value)}>
        {RANGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>Zeitraum: {o.label}</option>
        ))}
      </Select>
      <Select aria-label="Host" value={filters.host ?? ''} onChange={(e) => setFilter('host', e.target.value || undefined)}>
        <option value="">Host: alle</option>
        {hostOptions.map((h) => (
          <option key={h} value={h}>Host: {h}</option>
        ))}
      </Select>
      <Select aria-label="Schweregrad" value={filters.severity ?? ''} onChange={(e) => setFilter('severity', e.target.value || undefined)}>
        <option value="">Schweregrad: alle</option>
        {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
          <option key={s} value={s}>Schweregrad: {SEVERITY_LABEL[s]}</option>
        ))}
      </Select>
      <Select aria-label="MITRE ATT&CK" value={filters.mitre ?? ''} onChange={(e) => setFilter('mitre', e.target.value || undefined)}>
        <option value="">MITRE ATT&CK: alle</option>
        {mitre.data?.items.map((t) => (
          <option key={t.technique} value={t.technique}>MITRE: {t.technique}</option>
        ))}
      </Select>
      {active > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (['host', 'severity', 'mitre', 'q'] as const).forEach((k) => setFilter(k, undefined))}
          aria-label="Filter zurücksetzen"
        >
          <X /> {active} Filter
        </Button>
      )}
      <div className="relative ml-auto w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
        <Input aria-label="Suche" placeholder="Suche: Titel, Host, Benutzer, IP …" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-full pl-8" />
      </div>
    </div>
  );
}

export function Shell() {
  return (
    <div className="flex min-h-full gap-3 p-3">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="flex flex-col gap-2">
          <MobileNav />
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <FilterBar />
            </div>
            <LoginButton />
          </div>
        </header>
        <main className="flex min-w-0 flex-col gap-3">
          <Outlet />
        </main>
        <footer className="no-print mt-auto flex items-center gap-1.5 pt-2 text-2xs text-fg-subtle">
          <BarChart3 className="size-3" /> Homelab SOC Portal v1 · Daten aus Splunk und Cribl · Demo-Daten sind als „Simuliert“ markiert
        </footer>
      </div>
    </div>
  );
}
