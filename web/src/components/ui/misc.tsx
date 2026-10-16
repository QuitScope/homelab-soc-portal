import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui primitives (Input, Badge, Table) in the portal look

export const Input = ({ className, ...p }: ComponentProps<'input'>) => (
  <input
    className={cn(
      'h-8 w-full rounded-md border border-border-strong bg-panel-2 px-2.5 text-xs text-fg placeholder:text-fg-subtle focus:border-primary/60',
      className,
    )}
    {...p}
  />
);

export const Select = ({ className, ...p }: ComponentProps<'select'>) => (
  <select
    className={cn(
      'h-8 cursor-pointer appearance-none rounded-full border border-border-strong bg-panel-2 bg-[length:10px] bg-[right_10px_center] bg-no-repeat pl-3 pr-7 text-xs text-fg hover:border-petrol',
      "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238aa1a4' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")]",
      className,
    )}
    {...p}
  />
);

export const Badge = ({ className, ...p }: ComponentProps<'span'>) => (
  <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-px text-2xs font-medium', className)} {...p} />
);

export const Table = ({ className, ...p }: ComponentProps<'table'>) => (
  <div className="overflow-x-auto">
    <table className={cn('w-full border-collapse text-xs', className)} {...p} />
  </div>
);
export const Th = ({ className, ...p }: ComponentProps<'th'>) => (
  <th className={cn('h-8 border-b border-border px-2.5 text-left text-2xs font-medium uppercase tracking-wide text-fg-subtle', className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<'td'>) => <td className={cn('h-9 border-b border-border/60 px-2.5 text-fg', className)} {...p} />;
