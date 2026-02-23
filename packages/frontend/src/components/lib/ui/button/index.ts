import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';

export { default as Button } from './Button.vue';

export const buttonVariants = cva(
  'inline-flex gap-2 items-center justify-center rounded-md whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        'ghost-destructive': 'text-destructive-text hover:bg-destructive/20 hover:text-destructive-text',
        'soft-destructive': 'bg-destructive/15 text-destructive-text hover:bg-destructive/25',
        'ghost-primary': 'text-primary hover:bg-primary/10 hover:text-primary',
        success: 'bg-success text-success-foreground hover:bg-success/90',
        'outline-success': 'border border-success-text/30 text-success-text bg-background hover:bg-success-text/10',
        'ghost-success': 'text-success-text hover:bg-success-text/10 hover:text-success-text',
        'soft-success': 'bg-success-text/15 text-success-text hover:bg-success-text/25',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonVariantProps extends VariantProps<typeof buttonVariants> {}
