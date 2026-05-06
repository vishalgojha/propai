import React from 'react';
import { cn } from '../../lib/utils';

type SurfaceSectionProps = {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  visible?: boolean;
};

export function SurfaceSection({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className,
  visible = true,
}: SurfaceSectionProps) {
  if (!visible) return null;

  return (
    <section className={cn('rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]', className)}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-elevated)]">
            <Icon className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">{title}</p>
            {subtitle ? <h3 className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">{subtitle}</h3> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2 self-end sm:self-auto">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
