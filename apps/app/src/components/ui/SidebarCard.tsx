import React from 'react';
import { cn } from '../../lib/utils';

type SidebarCardProps = {
  children: React.ReactNode;
  className?: string;
  variant?: 'surface' | 'elevated' | 'accent';
};

const variantClasses: Record<NonNullable<SidebarCardProps['variant']>, string> = {
  surface: 'rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)]',
  elevated: 'rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)]',
  accent: 'rounded-[8px] border border-[color:var(--accent-border)] bg-[var(--accent-dim)]',
};

export function SidebarCard({ children, className, variant = 'elevated' }: SidebarCardProps) {
  return <div className={cn(variantClasses[variant], className)}>{children}</div>;
}
