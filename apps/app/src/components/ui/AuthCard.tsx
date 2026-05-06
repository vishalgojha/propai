import React from 'react';
import { cn } from '../../lib/utils';

type AuthCardProps = {
  children: React.ReactNode;
  className?: string;
  variant?: 'surface' | 'elevated' | 'accent';
};

const variantClasses: Record<NonNullable<AuthCardProps['variant']>, string> = {
  surface: 'rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-surface)]',
  elevated: 'rounded-[10px] border-[0.5px] border-[color:var(--border)] bg-[var(--bg-elevated)]',
  accent:
    'rounded-[14px] border border-[color:var(--accent-border)] bg-[linear-gradient(180deg,rgba(13,17,23,0.98),rgba(9,13,18,0.98))] shadow-[0_0_0_1px_rgba(37,211,102,0.08),0_24px_80px_rgba(0,0,0,0.35)]',
};

export const AuthCard: React.FC<AuthCardProps> = ({ children, className, variant = 'surface' }) => {
  return <div className={cn(variantClasses[variant], className)}>{children}</div>;
};
