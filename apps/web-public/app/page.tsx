import { getListings, formatPrice, generateDescription } from '@/app/lib/supabase';
import Link from 'next/link';

export const revalidate = 60;

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ type?: string; area?: string; q?: string }>
}) {
  const params = await searchParams;
  const type = params.type || 'ALL';
  const area = params.area || '';
  const q = params.q || '';

  const listings = await getListings({ type: type === 'ALL' ? undefined : type, area });

  const filtered = q
    ? listings.filter(l => {
        const entry = l.entries?.[0] || {};
        const searchText = [entry.sub_area, entry.area, entry.property_type, l.cleaned_message, l.message].filter(Boolean).join(' ').toLowerCase();
        return searchText.includes(q.toLowerCase());
      })
    : listings;

  const typeLabel = type === 'ALL' ? 'All' : type === 'rent' ? 'Rent' : type === 'sale' ? 'Sale' : 'Requirements';

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <a href="/" className="logo">PropAI</a>
          <nav className="nav">
            <a href="/">Listings</a>
            <a href="/mumbai">Explore Mumbai</a>
          </nav>
        </div>
      </header>

      <main className="container">
        <div className="hero">
          <h1>Mumbai Property Listings</h1>
          <p>Discover verified flats, apartments, and homes for rent and sale across Mumbai</p>
          <form className="search-box" action="/" method="get">
            <input type="text" name="q" placeholder="Search by location, BHK..." defaultValue={q} />
            <input type="hidden" name="type" value={type} />
            <button type="submit">Search</button>
          </form>
        </div>

        <div className="filters">
          {['ALL', 'rent', 'sale', 'requirement'].map(t => (
            <a key={t} href={`/?type=${t}`} className={`filter-btn ${type === t ? 'active' : ''}`}>
              {t === 'ALL' ? 'All' : t === 'rent' ? 'Rent' : t === 'sale' ? 'Sale' : 'Requirements'}
            </a>
          ))}
        </div>

        <div style={{ marginBottom: 16, color: '#666', fontSize: 14 }}>
          {filtered.length} {typeLabel.toLowerCase()} listings in Mumbai
          {area && ` in ${area}`}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
            <p>No listings found. Try adjusting your filters.</p>
            <p style={{ marginTop: 8, fontSize: 13, color: '#999' }}>
              Listings appear here once WhatsApp messages are processed by PropAI Pulse.
            </p>
          </div>
        ) : (
          <div className="listing-grid">
            {filtered.map(listing => {
              const entry = listing.entries?.[0] || {};
              const location = [entry.sub_area, entry.area].filter(Boolean).join(', ');
              return (
                <article key={listing.id} className="listing-card">
                  <div className="listing-header">
                    <span className={`listing-type ${entry.type === 'listing_rent' ? 'rent' : entry.type === 'listing_sale' ? 'sale' : 'requirement'}`}>
                      {entry.type === 'listing_rent' ? 'For Rent' : entry.type === 'listing_sale' ? 'For Sale' : 'Requirement'}
                    </span>
                  </div>
                  <div className="listing-price">{entry.price ? formatPrice(entry.price) : 'Price on request'}</div>
                  <div className="listing-details">
                    <div className="listing-area">{location || 'Mumbai'}</div>
                    <div className="listing-meta">
                      {entry.bhk && <span>{entry.bhk} BHK</span>}
                      {entry.size_sqft && <span>{entry.size_sqft} sq ft</span>}
                      {entry.furnishing && <span>{entry.furnishing}</span>}
                    </div>
                  </div>
                  <div className="listing-footer">
                    <span className="contact-hidden">Contact for details</span>
                    <Link href={`/listings/${listing.id}`} className="cta-btn">View Details</Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
