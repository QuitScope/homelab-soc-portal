import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Sidebar } from '@/components/Shell';
import { TooltipProvider } from '@/components/ui/tooltip';

const renderSidebar = () =>
  render(
    <MemoryRouter initialEntries={['/incidents']}>
      <TooltipProvider>
        <Sidebar />
      </TooltipProvider>
    </MemoryRouter>,
  );

describe('Sidebar', () => {
  beforeEach(() => localStorage.clear());

  it('starts collapsed (icons only), expands to show labels and remembers it', () => {
    renderSidebar();
    expect(screen.queryByText('Erkennungsregeln')).toBeNull();
    expect(screen.getByRole('link', { name: 'Incidents' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Navigation ausklappen' }));
    expect(screen.getByText('Erkennungsregeln')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Navigation einklappen' })).toHaveAttribute('aria-expanded', 'true');
    expect(localStorage.getItem('soc.sidebar.expanded')).toBe('1');
  });

  it('restores the expanded state after reload', () => {
    localStorage.setItem('soc.sidebar.expanded', '1');
    renderSidebar();
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });
});
