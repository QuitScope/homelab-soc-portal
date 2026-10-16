import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Shell } from './components/Shell';
import { TooltipProvider } from './components/ui/tooltip';
import { Dashboard } from './pages/Dashboard';
import { DetectionDetail, Detections } from './pages/Detections';
import { IncidentDetail, Incidents } from './pages/Incidents';
import { Hosts, NetworkPage, Pipelines, Reports, Settings, Soar, ThreatIntel } from './pages/Modules';
import './styles/tokens.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'incidents', element: <Incidents /> },
      { path: 'incidents/:id', element: <IncidentDetail /> },
      { path: 'detections', element: <Detections /> },
      { path: 'detections/:id', element: <DetectionDetail /> },
      { path: 'hosts', element: <Hosts /> },
      { path: 'network', element: <NetworkPage /> },
      { path: 'pipelines', element: <Pipelines /> },
      { path: 'soar', element: <Soar /> },
      { path: 'threat-intel', element: <ThreatIntel /> },
      { path: 'reports', element: <Reports /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <p className="p-6 text-fg-muted">Seite nicht gefunden.</p> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
