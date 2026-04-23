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
        const sd = l.structured_data || {};
        const searchText = [sd.sub_area, sd.area, sd.property_type, l.raw_text].filter(Boolean).join(' ').toLowerCase();
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
          </div>
        ) : (
          <div className="listing-grid">
            {filtered.map(listing => {
              const sd = listing.structured_data || {};
              const location = [sd.sub_area, sd.area].filter(Boolean).join(', ');
              return (
                <article key={listing.id} className="listing-card">
                  <div className="listing-header">
                    <span className={`listing-type ${sd.type === 'listing_rent' ? 'rent' : sd.type === 'listing_sale' ? 'sale' : 'requirement'}`}>
                      {sd.type === 'listing_rent' ? 'For Rent' : sd.type === 'listing_sale' ? 'For Sale' : 'Requirement'}
                    </span>
                  </div>
                  <div className="listing-price">{sd.price ? formatPrice(sd.price) : 'Price on request'}</div>
                  <div className="listing-details">
                    <div className="listing-area">{location || 'Mumbai'}</div>
                    <div className="listing-meta">
                      {sd.bhk && <span>{sd.bhk} BHK</span>}
                      {sd.size_sqft && <span>{sd.size_sqft} sq ft</span>}
                      {sd.furnishing && <span>{sd.furnishing}</span>}
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
