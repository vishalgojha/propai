import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-[color:var(--border)] bg-[var(--bg-surface)] py-12">
      <div className="mx-auto max-w-7xl px-5">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[18px] font-bold tracking-tighter text-[var(--accent)]">PropAI</span>
              <span className="text-[18px] font-bold tracking-tighter text-[var(--text-primary)]">Pulse</span>
            </div>
            <p className="text-[13px] leading-6 text-[var(--text-secondary)]">
              Real-time real estate inventory parsed directly from broker WhatsApp networks.
            </p>
          </div>
          
          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Platform</h4>
            <ul className="space-y-2">
              <li><Link href="/listings" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Browse Listings</Link></li>
              <li><Link href="/mcp" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">MCP Protocol</Link></li>
              <li><Link href="/api" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">API Access</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Localities</h4>
            <ul className="space-y-2">
              <li><Link href="/locality/bandra-west" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Bandra West</Link></li>
              <li><Link href="/locality/juhu" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Juhu</Link></li>
              <li><Link href="/locality/worli" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Worli</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Legal</h4>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Terms & Conditions</Link></li>
              <li><Link href="/refund" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Refund Policy</Link></li>
              <li><Link href="/cancellation" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Cancellation Policy</Link></li>
              <li><Link href="/contact" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Contact Us</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-12 border-t border-[color:var(--border)] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[11px] text-[var(--text-muted)]">
            © {new Date().getFullYear()} PropAI. Built for high-speed real estate.
          </p>
          <div className="flex gap-4">
            <span className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-widest px-2 py-0.5 rounded border border-[color:var(--accent-border)] bg-[var(--accent-glow)]">Live System</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
