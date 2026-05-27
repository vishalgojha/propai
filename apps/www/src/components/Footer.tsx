import Link from 'next/link';
import { fetchLocalitiesForFooter } from '@/lib/publicListings';

export default async function Footer() {
  const cities = await fetchLocalitiesForFooter(2);

  return (
    <footer className="border-t border-[color:var(--border)] bg-[var(--bg-surface)] pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-5">
        {/* Top row: brand + quick links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pb-14 border-b border-[color:var(--border)]">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[18px] font-bold tracking-tighter text-[var(--accent)]">PropAI</span>
              <span className="text-[18px] font-bold tracking-tighter text-[var(--text-primary)]">Pulse</span>
            </div>
            <p className="text-[13px] leading-6 text-[var(--text-secondary)] max-w-xs">
              Real-time off-market real estate intelligence across Indian micro-markets.
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
              <li><Link href="/about" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">About PropAI</Link></li>
              <li><Link href="/contact" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Contact Us</Link></li>
              <li><Link href="/privacy" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Terms &amp; Conditions</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Company</h4>
            <ul className="space-y-2">
              <li><Link href="/broker/signup" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">For Brokers</Link></li>
              <li><Link href="/refund" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Refund Policy</Link></li>
              <li><Link href="/cancellation" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Cancellation Policy</Link></li>
              <li><Link href="/contact" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Support</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom row: relational locality grid */}
        {cities.length > 0 && (
          <div className="pt-14">
            <h2 className="mb-8 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Related markets</h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
              {cities.map((cityGroup) => (
                <div key={cityGroup.city} className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">{cityGroup.city}</h3>
                  <div className="mt-4 space-y-3">
                    {cityGroup.localities.slice(0, 8).map((loc) => (
                      <div key={loc.slug} className="rounded-[14px] border border-[color:var(--border)] bg-[var(--bg-surface)] px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={`/listings?locality=${encodeURIComponent(loc.name)}`}
                              className="text-[13px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                            >
                              {loc.name}
                            </Link>
                            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">{loc.count} live item{loc.count === 1 ? '' : 's'}</p>
                          </div>
                          <span className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                            Nearby
                          </span>
                        </div>
                        {loc.related.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {loc.related.map((related) => (
                              <Link
                                key={related.slug}
                                href={`/listings?locality=${encodeURIComponent(related.name)}`}
                                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[color:var(--accent-border)] hover:text-[var(--accent)] transition-colors"
                              >
                                <span>{related.name}</span>
                                <span className="text-[10px] text-[var(--text-muted)]">{related.count}</span>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-[11px] text-[var(--text-muted)]">No nearby market links found yet.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-14 border-t border-[color:var(--border)] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[11px] text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} PropAI. Built for high-speed real estate.
          </p>
          <div className="flex gap-4">
            <span className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-widest px-2 py-0.5 rounded border border-[color:var(--accent-border)] bg-[var(--accent-glow)]">Live System</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
