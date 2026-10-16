import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { layout, Topology } from '@/components/Topology';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Topology as TopologyData } from '@/lib/types';

const data: TopologyData = {
  eventsError: null,
  nodes: [
    { id: 'src:203.0.113.10', type: 'source', label: '203.0.113.10', status: 'attack', column: 0, meta: { 'Fehlgeschlagene Logins': 5 } },
    { id: 'host:lab-linux-01', type: 'host', label: 'lab-linux-01', status: 'active', column: 1, meta: { Ereignisse: 51, 'Zuletzt gesehen': '2026-10-15T18:43:24.000Z' } },
    { id: 'cribl', type: 'pipeline', label: 'Cribl Stream', status: 'up', column: 2, meta: { Version: '4.20.2', 'Gesendet an Splunk (seit Start)': null } },
    { id: 'splunk', type: 'siem', label: 'Splunk', status: 'down', column: 3, meta: { Status: 'timeout: timeout after 8000 ms' } },
    { id: 'portal', type: 'portal', label: 'SOC Portal', status: 'up', column: 4, meta: {} },
    { id: 'wazuh', type: 'integration', label: 'Wazuh', status: 'not_configured', column: 5, meta: { Status: 'Not configured' } },
  ],
  edges: [
    { id: 'a', source: 'src:203.0.113.10', target: 'host:lab-linux-01', label: '5 Fehlversuche', kind: 'attack' },
    { id: 'b', source: 'host:lab-linux-01', target: 'cribl', label: 'syslog UDP 9514', kind: 'normal' },
    { id: 'c', source: 'portal', target: 'wazuh', label: 'EDR', kind: 'planned' },
  ],
};

const renderTopo = (showPlanned = true) =>
  render(
    <TooltipProvider>
      <div style={{ width: 800, height: 400 }}>
        <Topology data={data} height={300} showPlanned={showPlanned} />
      </div>
    </TooltipProvider>,
  );

describe('Topology', () => {
  it('renders every node with its label', () => {
    renderTopo();
    for (const n of data.nodes) expect(screen.getByTestId(`topo-node-${n.id}`)).toHaveTextContent(n.label);
  });

  it('opens a detail drawer with status and metadata on click, missing values shown as "nicht verfügbar"', () => {
    renderTopo();
    fireEvent.click(screen.getByTestId('topo-node-cribl'));
    const drawer = screen.getByTestId('topology-drawer');
    expect(screen.getByRole('dialog')).toHaveTextContent('Cribl Stream');
    expect(screen.getByRole('dialog')).toHaveTextContent('Datenpipeline');
    expect(drawer).toHaveTextContent('Online');
    expect(drawer).toHaveTextContent('4.20.2');
    expect(within(drawer).getByText('nicht verfügbar')).toBeInTheDocument();
  });

  it('shows the error state of a down integration in the drawer', () => {
    renderTopo();
    fireEvent.click(screen.getByTestId('topo-node-splunk'));
    expect(screen.getByTestId('topology-drawer')).toHaveTextContent('Offline');
    expect(screen.getByTestId('topology-drawer')).toHaveTextContent('timeout after 8000 ms');
  });

  it('hides planned integrations on request', () => {
    renderTopo(false);
    expect(screen.queryByTestId('topo-node-wazuh')).toBeNull();
    expect(screen.getByTestId('topo-node-portal')).toBeInTheDocument();
  });
});

describe('layout()', () => {
  it('places columns left to right and styles edges by kind', () => {
    const { nodes, edges } = layout(data, 300);
    const x = (id: string) => nodes.find((n) => n.id === id)!.position.x;
    expect(x('src:203.0.113.10')).toBeLessThan(x('host:lab-linux-01'));
    expect(x('splunk')).toBeLessThan(x('portal'));
    const attack = edges.find((e) => e.id === 'a')!;
    expect(attack.animated).toBe(true);
    expect(attack.style?.stroke).toBe('var(--color-sev-critical)');
    expect(edges.find((e) => e.id === 'c')!.style?.strokeDasharray).toBe('4 4');
  });

  it('drops edges whose nodes are hidden', () => {
    const { nodes, edges } = layout(data, 300, false);
    expect(nodes.map((n) => n.id)).not.toContain('wazuh');
    expect(edges.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
