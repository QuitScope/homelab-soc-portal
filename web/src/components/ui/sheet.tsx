import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** shadcn/ui-style Sheet (side drawer) and Dialog on top of Radix Dialog */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'right',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: 'right' | 'center';
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" />
        <D.Content
          className={cn(
            'panel fixed z-50 flex flex-col gap-3 p-4 shadow-2xl shadow-black/60 focus:outline-none',
            side === 'right'
              ? 'inset-y-2 right-2 w-[min(440px,calc(100vw-1rem))] overflow-y-auto'
              : 'left-1/2 top-1/2 w-[min(380px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <D.Title className="text-sm font-semibold text-fg">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-xs text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">Details</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 text-fg-muted hover:bg-panel-3 hover:text-fg" aria-label="Schließen">
              <X className="size-4" />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
