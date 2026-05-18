import Link from 'next/link';

export default function PublicNav() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[color:var(--border)] bg-[var(--bg-base)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-8">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--accent)] shadow-[0_0_12px_rgba(62,232,138,0.5)] animate-live-pulse" />
            <span className="text-[18px] font-bold tracking-tight text-white">
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
        </div>
      </div>
    </nav>
  );
}
