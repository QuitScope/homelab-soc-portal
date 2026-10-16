import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EventAnalytics } from '@/lib/types';
import { fmtDateTime, fmtTime } from '@/lib/utils';

const axis = { stroke: 'var(--color-fg-subtle)', fontSize: 10, tickLine: false, axisLine: false } as const;
const tooltip = {
  contentStyle: { background: 'var(--color-panel-3)', border: '1px solid var(--color-border-strong)', borderRadius: 8, fontSize: 11 },
  labelStyle: { color: 'var(--color-fg-muted)' },
  labelFormatter: (v: unknown) => fmtDateTime(String(v)),
};
const tickTime = (range: string) => (v: string) =>
  range === '1h' || range === '24h' ? fmtTime(v) : new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

function Grad({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={color} stopOpacity={0.45} />
      <stop offset="1" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

export function ActivityChart({ data, range, height = 150 }: { data: { time: string; created: number; resolved: number }[]; range: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -28 }}>
        <defs>
          <Grad id="g-created" color="var(--color-primary)" />
          <Grad id="g-resolved" color="var(--color-st-resolved)" />
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="time" {...axis} tickFormatter={tickTime(range)} minTickGap={24} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltip} />
        <Area type="monotone" dataKey="created" name="Neu" stroke="var(--color-primary)" fill="url(#g-created)" strokeWidth={1.6} />
        <Area type="monotone" dataKey="resolved" name="Gelöst" stroke="var(--color-st-resolved)" fill="url(#g-resolved)" strokeWidth={1.6} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function EventTimelineChart({ data, range, height = 170 }: { data: EventAnalytics['timeline']; range: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -24 }}>
        <defs>
          <Grad id="g-success" color="var(--color-primary)" />
          <Grad id="g-failure" color="var(--color-sev-critical)" />
          <Grad id="g-other" color="var(--color-fg-subtle)" />
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="time" {...axis} tickFormatter={tickTime(range)} minTickGap={24} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tooltip} />
        <Area type="monotone" stackId="1" dataKey="success" name="Erfolg" stroke="var(--color-primary)" fill="url(#g-success)" strokeWidth={1.5} />
        <Area type="monotone" stackId="1" dataKey="failure" name="Fehlschlag" stroke="var(--color-sev-critical)" fill="url(#g-failure)" strokeWidth={1.5} />
        <Area type="monotone" stackId="1" dataKey="other" name="Ohne Ergebnis" stroke="var(--color-fg-subtle)" fill="url(#g-other)" strokeWidth={1} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const BAR_COLORS = ['var(--color-primary)', 'var(--color-petrol)', 'var(--color-sev-low)', 'var(--color-sev-medium)', 'var(--color-fg-subtle)'];

export function HBarChart({ data, height = 150 }: { data: { name: string; count: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...axis} width={96} />
        <Tooltip {...tooltip} labelFormatter={(v) => String(v)} cursor={{ fill: 'var(--color-panel-3)' }} />
        <Bar dataKey="count" name="Events" radius={[0, 4, 4, 0]} barSize={10}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
