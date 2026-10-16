import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';

export const TooltipProvider = T.Provider;

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-md border border-border-strong bg-panel-3 px-2.5 py-1.5 text-xs text-fg shadow-lg shadow-black/40"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
