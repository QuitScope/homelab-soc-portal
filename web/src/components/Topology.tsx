import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Database, Globe, Plug, Server, ShieldCheck, Workflow, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TopoNode, Topology as TopologyData } from '@/lib/types';
import { cn, fmtDateTime } from '@/lib/utils';
import { STATE_LABEL, StateDot } from './badges';
import { Sheet } from './ui/sheet';

const ICON: Record<TopoNode['type'], LucideIcon> = { source: Globe, host: Server, pipeline: Workflow, siem: Database, portal: ShieldCheck, integration: Plug };
const TYPE_LABEL: Record<TopoNode['type'], string> = {
  source: 'Externe Quelle', host: 'Linux-Host', pipeline: 'Datenpipeline', siem: 'SIEM', portal: 'Portal', integration: 'Integration',
};
const RING: Record<string, string> = {
  attack: 'border-sev-critical text-sev-critical shadow-[0_0_16px] shadow-sev-critical/50',
  down: 'border-sev-critical text-sev-critical shadow-[0_0_12px] shadow-sev-critical/40',
  degraded: 'border-warn text-warn',
  suspicious: 'border-warn text-warn',
  not_configured: 'border-off border-dashed text-fg-subtle',
  idle: 'border-border-strong text-fg-muted',
};

type FlowNode = Node<{ node: TopoNode }, 'soc'>;

function SocNode({ data, selected }: NodeProps<FlowNode>) {
  const n = data.node;
  const Icon = ICON[n.type];
  return (
    <div className="flex w-[116px] flex-col items-center gap-1" data-testid={`topo-node-${n.id}`}>
      <Handle type="target" position={Position.Left} className="!size-1 !border-0 !bg-transparent" />
      <div
        className={cn(
          'grid size-11 place-items-center rounded-full border-2 bg-panel-2 transition-transform',
          RING[n.status] ?? 'border-primary text-primary shadow-[0_0_14px] shadow-primary/40',
          selected && 'scale-110',
        )}
      >
        <Icon className="size-[18px]" />
      </div>
      <span className="max-w-full truncate rounded bg-panel/80 px-1 text-[11px] font-medium text-fg">{n.label}</span>
      <Handle type="source" position={Position.Right} className="!size-1 !border-0 !bg-transparent" />
    </div>
  );
}

const nodeTypes = { soc: SocNode };

/** columns left → right; nodes within a column centred vertically */
export function layout(data: TopologyData, height: number, showPlanned = true) {
  const visible = data.nodes.filter((n) => showPlanned || n.type !== 'integration');
  const ids = new Set(visible.map((n) => n.id));
  const byCol = new Map<number, TopoNode[]>();
  for (const n of visible) byCol.set(n.column, [...(byCol.get(n.column) ?? []), n]);
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  const nodes: FlowNode[] = cols.flatMap((c, ci) => {
    const list = byCol.get(c)!;
    const gap = Math.min(86, (height - 40) / Math.max(list.length, 1));
    const top = height / 2 - ((list.length - 1) * gap) / 2 - 30;
    return list.map((n, i) => ({ id: n.id, type: 'soc' as const, position: { x: ci * 140, y: top + i * gap }, data: { node: n } }));
  });
  // portal ← cribl runs straight through the Splunk node in this layout: draw it faint, unlabeled and below the others
  const background = (e: { source: string; target: string }) => e.source === 'cribl' && e.target === 'portal';
  const edges: Edge[] = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'default',
    animated: e.kind === 'attack',
    label: e.kind === 'planned' || background(e) ? undefined : e.label,
    zIndex: background(e) ? 0 : 1,
    labelStyle: { fill: 'var(--color-fg-subtle)', fontSize: 9 },
    labelShowBg: true,
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 3,
    labelBgStyle: { fill: '#070e10', fillOpacity: 1 },
    style: {
      stroke: e.kind === 'attack' ? 'var(--color-sev-critical)' : e.kind === 'planned' ? 'var(--color-off)' : 'var(--color-primary)',
      strokeWidth: e.kind === 'attack' ? 2 : 1.4,
      strokeDasharray: e.kind === 'planned' ? '4 4' : undefined,
      opacity: e.kind === 'planned' ? 0.6 : background(e) ? 0.25 : 0.9,
    },
  }));
  return { nodes, edges };
}

export function Topology({ data, height = 300, showPlanned = true }: { data: TopologyData; height?: number; showPlanned?: boolean }) {
  const [selected, setSelected] = useState<TopoNode | null>(null);
  const { nodes, edges } = useMemo(() => layout(data, height, showPlanned), [data, height, showPlanned]);
  return (
    <div style={{ height }} className="relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesConnectable={false}
        nodesDraggable
        minZoom={0.4}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => setSelected((n as FlowNode).data.node)}
        colorMode="dark"
      >
        <Background gap={18} size={1} color="var(--color-border)" />
      </ReactFlow>
      <Sheet
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected?.label}
        description={selected && TYPE_LABEL[selected.type]}
      >
        {selected && (
          <div className="flex flex-col gap-3 text-xs" data-testid="topology-drawer">
            <div className="flex items-center gap-2">
              <StateDot state={selected.status} pulse />
              <span className="font-medium">{STATE_LABEL[selected.status] ?? selected.status}</span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {Object.entries(selected.meta).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-subtle">{k}</dt>
                  <dd className="break-all text-fg">{v == null ? <span className="text-fg-subtle">nicht verfügbar</span> : k === 'Zuletzt gesehen' ? fmtDateTime(String(v)) : String(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export const TopologyLegend = () => (
  <div className="flex items-center gap-3 text-2xs text-fg-muted">
    <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-sev-critical" /> Angriffspfad</span>
    <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-primary" /> Normal</span>
    <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded border-t border-dashed border-off" /> Geplant</span>
  </div>
);
