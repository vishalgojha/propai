import Link from 'next/link';
import { fetchLocalitiesForFooter } from '@/lib/publicListings';

export default async function Footer() {
  const cities = await fetchLocalitiesForFooter(2);

  return (
    <footer className="hidden md:block border-t border-white/3 bg-[var(--bg-surface)]/40 backdrop-blur-md pt-12 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-5">
        
        {/* Relational locality grid: placed at the top of the footer */}
        {cities.length > 0 && (
          <div className="border-b border-white/3 pb-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Related markets</h2>
                <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Flat locality rails with live counts and bounce-off links.</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
              {cities.map((cityGroup) => (
                <div key={cityGroup.city}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">{cityGroup.city}</h3>
                  <div className="mt-3 space-y-1.5">
                    {cityGroup.localities.slice(0, 8).map((loc) => (
                      <Link
                        key={loc.slug}
                        href={`/listings?locality=${encodeURIComponent(loc.name)}`}
                        target="_self"
                        className="flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-[var(--bg-elevated)]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
                            {loc.name}
                          </p>
                          <p className="text-[11px] text-[var(--text-secondary)]">{loc.count} live item{loc.count === 1 ? '' : 's'}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-white/3 bg-[var(--bg-base)]/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                          Open
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Brand + quick links: placed at the bottom of the footer (above copyright) */}
        <div className="grid grid-cols-1 gap-8 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[18px] font-bold tracking-tighter text-[var(--accent)]">PropAI</span>
              <span className="text-[18px] font-bold tracking-tighter text-[var(--text-primary)]">Pulse</span>
            </div>
            <p className="text-[13px] leading-6 text-[var(--text-secondary)] max-w-xs">
              Real-time Realtor-network real estate intelligence across Indian micro-markets.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Property Types</h4>
            <ul className="space-y-2">
              <li><Link href="/listings?type=Rent" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Rentals</Link></li>
              <li><Link href="/listings?type=Sale" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Sale</Link></li>
              <li><Link href="/listings" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">All Listings</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Quick Links</h4>
            <ul className="space-y-2">
              <li><Link href="/listings" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Browse Listings</Link></li>
              <li><Link href="/localities" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Locality Directory</Link></li>
              <li><Link href="/about" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">About PropAI</Link></li>
              <li><Link href="/contact" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Contact Us</Link></li>
              <li><Link href="/privacy" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Terms &amp; Conditions</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Company</h4>
            <ul className="space-y-2">
              <li><Link href="https://app.propai.live" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">For Realtors</Link></li>
              <li><Link href="/mcp" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">AI Tools</Link></li>
              <li><Link href="/refund" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Refund Policy</Link></li>
              <li><Link href="/cancellation" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Cancellation Policy</Link></li>
              <li><Link href="/contact" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Support</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-14 border-t border-white/3 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[11px] text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} PropAI. Built for high-speed real estate.
          </p>
          <div className="flex gap-4">
            <span className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-widest px-2 py-0.5 rounded border border-[color:var(--accent-border)]/20 bg-[var(--accent-glow)]">Live System</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
