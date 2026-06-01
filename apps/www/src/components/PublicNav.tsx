'use client';

import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function PublicNav() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[color:var(--border)] bg-[var(--bg-base)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex items-center gap-3">
              <img src="/favicon.svg" alt="PropAI" className="h-8 w-8 rounded-[10px]" />
              <span className="text-[16px] font-bold tracking-tight text-[var(--text-primary)] sm:text-[18px]">
                PropAI <span className="text-[var(--accent)]">Pulse</span>
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)] sm:hidden"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:gap-8 sm:overflow-visible sm:pb-0">
          <Link href="/about" className="shrink-0 rounded-full border border-transparent px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--border)] hover:text-[var(--accent)]">
            About
          </Link>
          <Link href="https://app.propai.live" className="shrink-0 rounded-full border border-transparent px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--border)] hover:text-[var(--accent)]">
            For Realtors
          </Link>
          <Link href="/contact" className="shrink-0 rounded-full border border-transparent px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] transition-colors hover:border-[color:var(--border)] hover:text-[var(--accent)]">
            Contact
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)] sm:flex"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </nav>
  );
}
