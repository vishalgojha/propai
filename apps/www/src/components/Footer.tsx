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

        {/* Bottom row: SEO locality grid */}
        {cities.length > 0 && (
          <div className="pt-14">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-8">Browse properties by locality</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-8 gap-y-10">
              {cities.map((cityGroup) => (
                <div key={cityGroup.city}>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)] mb-3">{cityGroup.city}</h3>
                  <ul className="space-y-1.5">
                    {cityGroup.localities.slice(0, 20).map((loc) => (
                      <li key={loc.name}>
                        <Link
                          href={`/listings?locality=${encodeURIComponent(loc.name)}`}
                          className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                        >
                          {loc.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
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