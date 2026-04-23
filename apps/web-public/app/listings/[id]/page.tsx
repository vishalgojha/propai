import { getListingById, formatPrice, generateDescription } from '@/app/lib/supabase';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) return { title: 'Listing Not Found' };

  const entry = listing.entries?.[0] || {};
  const location = [entry.sub_area, entry.area].filter(Boolean).join(', ');
  const description = generateDescription(listing);

  return {
    title: `${location} ${entry.bhk ? entry.bhk + ' BHK' : ''} - ${entry.price ? formatPrice(entry.price) : 'Price on request'} | PropAI`,
    description,
    openGraph: {
      title: `${location} - PropAI`,
      description,
      type: 'website',
    }
  };
}

export async function generateStaticParams() {
  return [];
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const listing = await getListingById(id);

  if (!listing) notFound();

  const entry = listing.entries?.[0] || {};
  const location = [entry.sub_area, entry.area].filter(Boolean).join(', ');
  const description = generateDescription(listing);

  const schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: `${location} ${entry.bhk ? entry.bhk + ' BHK' : ''}`,
    description,
    url: `https://www.propai.live/listings/${listing.id}`,
    datePosted: listing.timestamp,
    ...(entry.price && {
      offers: {
        '@type': 'Offer',
        price: entry.price,
        priceCurrency: 'INR',
        ...(entry.price_type === 'monthly' && { availability: 'https://schema.org/Rent' })
      }
    }),
    ...(location && {
      location: {
        '@type': 'Place',
        name: location
      }
    })
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
      />

      <header className="header">
        <div className="container header-inner">
          <a href="/" className="logo">PropAI</a>
          <nav className="nav">
            <a href="/">Listings</a>
            <a href="/mumbai">Explore Mumbai</a>
          </nav>
        </div>
      </header>

      <main className="container" style={{ padding: '32px 16px' }}>
        <a href="/" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>← Back to listings</a>

        <div style={{ background: '#fff', borderRadius: 12, padding: 32, marginTop: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <span className={`listing-type ${entry.type === 'listing_rent' ? 'rent' : entry.type === 'listing_sale' ? 'sale' : 'requirement'}`} style={{ fontSize: 12, padding: '6px 12px' }}>
                {entry.type === 'listing_rent' ? 'For Rent' : entry.type === 'listing_sale' ? 'For Sale' : 'Requirement'}
              </span>
              <h1 style={{ fontSize: 32, marginTop: 12 }}>{location || 'Mumbai'}</h1>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 36, fontWeight: 700 }}>{entry.price ? formatPrice(entry.price) : 'Price on request'}</div>
              {entry.price_type === 'monthly' && <div style={{ color: '#666', fontSize: 14 }}>per month</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {entry.bhk && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Property Type</div>
                <div style={{ fontWeight: 500 }}>{entry.bhk} BHK</div>
              </div>
            )}
            {entry.size_sqft && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Area</div>
                <div style={{ fontWeight: 500 }}>{entry.size_sqft} sq ft</div>
              </div>
            )}
            {entry.furnishing && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Furnishing</div>
                <div style={{ fontWeight: 500 }}>{entry.furnishing}</div>
              </div>
            )}
            {entry.property_type && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Type</div>
                <div style={{ fontWeight: 500 }}>{entry.property_type}</div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>About this property</h2>
            <p style={{ color: '#444', lineHeight: 1.7 }}>{description}</p>
          </div>

          {listing.cleaned_message && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, marginBottom: 8 }}>Listing details</h2>
              <p style={{ color: '#444', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {listing.cleaned_message.slice(0, 500)}{listing.cleaned_message.length > 500 ? '...' : ''}
              </p>
            </div>
          )}

          <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 8, padding: 24, textAlign: 'center' }}>
            <p style={{ marginBottom: 16, color: '#666' }}>Interested in this property?</p>
            <button className="cta-btn" style={{ fontSize: 16, padding: '12px 32px' }}>Get Contact Details</button>
            <p style={{ marginTop: 12, fontSize: 12, color: '#999' }}>Phone number will be shared after inquiry</p>
          </div>
        </div>
      </main>
    </>
  );
}
