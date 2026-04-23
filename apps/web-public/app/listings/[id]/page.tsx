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

  const sd = listing.structured_data || {};
  const location = [sd.sub_area, sd.area].filter(Boolean).join(', ');
  const description = generateDescription(listing);

  return {
    title: `${location} ${sd.bhk ? sd.bhk + ' BHK' : ''} - ${sd.price ? formatPrice(sd.price) : 'Price on request'} | PropAI`,
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

  const sd = listing.structured_data || {};
  const location = [sd.sub_area, sd.area].filter(Boolean).join(', ');
  const description = generateDescription(listing);

  const schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: `${location} ${sd.bhk ? sd.bhk + ' BHK' : ''}`,
    description,
    url: `https://www.propai.live/listings/${listing.id}`,
    datePosted: listing.created_at,
    ...(sd.price && {
      offers: {
        '@type': 'Offer',
        price: sd.price,
        priceCurrency: 'INR',
        ...(sd.price_type === 'monthly' && { availability: 'https://schema.org/Rent' })
      }
    }),
    ...(sd.location && {
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
              <span className={`listing-type ${sd.type === 'listing_rent' ? 'rent' : sd.type === 'listing_sale' ? 'sale' : 'requirement'}`} style={{ fontSize: 12, padding: '6px 12px' }}>
                {sd.type === 'listing_rent' ? 'For Rent' : sd.type === 'listing_sale' ? 'For Sale' : 'Requirement'}
              </span>
              <h1 style={{ fontSize: 32, marginTop: 12 }}>{location || 'Mumbai'}</h1>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 36, fontWeight: 700 }}>{sd.price ? formatPrice(sd.price) : 'Price on request'}</div>
              {sd.price_type === 'monthly' && <div style={{ color: '#666', fontSize: 14 }}>per month</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {sd.bhk && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Property Type</div>
                <div style={{ fontWeight: 500 }}>{sd.bhk} BHK</div>
              </div>
            )}
            {sd.size_sqft && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Area</div>
                <div style={{ fontWeight: 500 }}>{sd.size_sqft} sq ft</div>
              </div>
            )}
            {sd.furnishing && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Furnishing</div>
                <div style={{ fontWeight: 500 }}>{sd.furnishing}</div>
              </div>
            )}
            {sd.property_type && (
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Type</div>
                <div style={{ fontWeight: 500 }}>{sd.property_type}</div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>About this property</h2>
            <p style={{ color: '#444', lineHeight: 1.7 }}>{description}</p>
          </div>

          {listing.raw_text && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, marginBottom: 8 }}>Listing details</h2>
              <p style={{ color: '#444', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{listing.raw_text.slice(0, 500)}{listing.raw_text.length > 500 ? '...' : ''}</p>
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
