'use client';

import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function PublicNav() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[color:var(--border)] bg-[var(--bg-base)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="PropAI" className="h-8 w-8 rounded-[10px]" />
            <span className="text-[18px] font-bold tracking-tight text-[var(--text-primary)]">
              PropAI <span className="text-[var(--accent)]">Pulse</span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-8">
          <Link href="/mcp" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
            MCP
          </Link>
          <Link href="/broker/signup" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
            For brokers
          </Link>
          <Link href="/contact" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
            Contact
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </nav>
  );
}
