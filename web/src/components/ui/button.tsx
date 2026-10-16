import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui button, restyled with the portal tokens
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-fg hover:bg-primary/85',
        outline: 'border border-border-strong bg-panel-2 text-fg hover:bg-panel-3 hover:border-petrol',
        ghost: 'text-fg-muted hover:bg-panel-3 hover:text-fg',
        danger: 'bg-sev-critical/15 text-sev-critical border border-sev-critical/40 hover:bg-sev-critical/25',
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-8 px-3',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
);

export function Button({ className, variant, size, asChild, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
