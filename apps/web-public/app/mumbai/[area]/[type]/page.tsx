import { getListings, getAreas, formatPrice } from '@/app/lib/supabase';
import Link from 'next/link';
import { Metadata } from 'next';

interface Props {
  params: Promise<{ area: string; type: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { area, type } = await params;
  const typeLabel = type === 'rent' ? 'for rent' : type === 'sale' ? 'for sale' : '';
  return {
    title: `${area} Mumbai Property ${typeLabel} | PropAI`,
    description: `Browse verified ${typeLabel} listings in ${area}, Mumbai. Find flats, apartments, and homes at PropAI.`,
  };
}

export default async function AreaTypePage({ params }: Props) {
  const { area, type } = await params;
  const listings = await getListings({
    type: type === 'rent' || type === 'sale' || type === 'requirement' ? type : undefined,
    area
  });

  const typeLabel = type === 'rent' ? 'Rent' : type === 'sale' ? 'Sale' : type === 'requirement' ? 'Requirements' : 'Listings';

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
        <div style={{ padding: '24px 0' }}>
          <Link href="/" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>← All listings</Link>
          <h1 style={{ fontSize: 28, marginTop: 8, textTransform: 'capitalize' }}>{area} - {typeLabel}</h1>
          <p style={{ color: '#666', marginTop: 4 }}>{listings.length} properties found</p>
        </div>

        <div className="filters">
          {['ALL', 'rent', 'sale', 'requirement'].map(t => (
            <a key={t} href={`/mumbai/${area}/${t}`} className={`filter-btn ${type === t ? 'active' : ''}`}>
              {t === 'ALL' ? 'All' : t === 'rent' ? 'Rent' : t === 'sale' ? 'Sale' : 'Requirements'}
            </a>
          ))}
        </div>

        {listings.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
            <p>No listings found in {area}. Try another area.</p>
          </div>
        ) : (
          <div className="listing-grid">
            {listings.map(listing => {
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
