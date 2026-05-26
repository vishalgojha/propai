import Link from 'next/link';
import { fetchPublicListings } from '@/lib/publicListings';

async function getLocalities(): Promise<string[]> {
  try {
    const listings = await fetchPublicListings();
    const seen = new Set<string>();
    for (const l of listings) {
      if (l.locality && l.locality !== "Unknown locality") {
        seen.add(l.locality);
      }
    }
    return Array.from(seen).sort();
  } catch {
    return ["Bandra West", "Worli", "Andheri West", "Powai", "Juhu", "Goregaon", "Malad", "Thane"];
  }
}

export default async function Footer() {
  const localities = await getLocalities();
  const topLocalities = localities.slice(0, 8);

  return (
    <footer className="border-t border-[color:var(--border)] bg-[var(--bg-surface)] py-16">
      <div className="mx-auto max-w-7xl px-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-10">
          {/* Column 1: Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[18px] font-bold tracking-tighter text-[var(--accent)]">PropAI</span>
              <span className="text-[18px] font-bold tracking-tighter text-[var(--text-primary)]">Pulse</span>
            </div>
            <p className="text-[13px] leading-6 text-[var(--text-secondary)] max-w-xs">
              Real-time off-market real estate intelligence across Indian micro-markets.
            </p>
          </div>

          {/* Column 2: Property in Mumbai */}
          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Property by Locality</h4>
            <ul className="space-y-2">
              {topLocalities.map((loc) => (
                <li key={loc}>
                  <Link
                    href={`/listings?locality=${encodeURIComponent(loc)}`}
                    className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]"
                  >
                    {loc}
                  </Link>
                </li>
              ))}
              {localities.length > 8 && (
                <li>
                  <Link href="/listings" className="text-[13px] text-[var(--accent)] hover:underline font-semibold">
                    View all localities →
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* Column 3: Property Types */}
          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Property Types</h4>
            <ul className="space-y-2">
              <li><Link href="/listings?type=Rent" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Rentals</Link></li>
              <li><Link href="/listings?type=Sale" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Sale</Link></li>
              <li><Link href="/listings" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">All Listings</Link></li>
            </ul>
          </div>

          {/* Column 4: Quick Links */}
          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Quick Links</h4>
            <ul className="space-y-2">
              <li><Link href="/listings" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Browse Listings</Link></li>
              <li><Link href="/contact" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Contact Us</Link></li>
              <li><Link href="/privacy" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Terms &amp; Conditions</Link></li>
            </ul>
          </div>

          {/* Column 5: Company */}
          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]">Company</h4>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">About PropAI</Link></li>
              <li><Link href="/refund" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Refund Policy</Link></li>
              <li><Link href="/cancellation" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Cancellation Policy</Link></li>
              <li><Link href="/contact" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)]">Support</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-14 border-t border-[color:var(--border)] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
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
