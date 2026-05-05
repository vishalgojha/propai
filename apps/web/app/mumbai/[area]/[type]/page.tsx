import { Header } from '@/app/components/Header';
import { ListingCard } from '@/app/components/ListingCard';
import { getListingSchema } from '@/app/lib/publicListingUtils';
import { listPublicListings } from '@/app/lib/publicListingsService';
import Link from 'next/link';
import { Metadata } from 'next';

interface Props {
  params: Promise<{ area: string; type: string }>;
}

export const dynamic = 'force-dynamic';

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
  const { items: listings } = await listPublicListings({
    type: type === 'rent' || type === 'sale' || type === 'requirement' ? type : undefined,
    area
  });

  const typeLabel = type === 'rent' ? 'Rent' : type === 'sale' ? 'Sale' : type === 'requirement' ? 'Requirements' : 'Listings';
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: listings.slice(0, 24).map((listing, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `https://www.propai.live/listings/${listing.id}`,
      item: getListingSchema(listing, 'https://www.propai.live'),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <Header />

      <main className="container">
        <div className="section-intro">
          <Link href="/" className="back-link">← All listings</Link>
          <h1 className="section-title">{area} - {typeLabel}</h1>
          <p className="section-subtitle">{listings.length} properties found</p>
        </div>

        <div className="filters">
          {['ALL', 'rent', 'sale', 'requirement'].map(t => (
            <a key={t} href={`/mumbai/${encodeURIComponent(area)}/${t}`} className={`filter-btn ${type === t ? 'active' : ''}`}>
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
            {listings.map(listing => <ListingCard key={listing.id} listing={listing} />)}
          </div>
        )}
      </main>
    </>
  );
}
