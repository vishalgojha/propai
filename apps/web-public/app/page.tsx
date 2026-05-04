import { Header } from '@/app/components/Header';
import { ListingCard } from '@/app/components/ListingCard';
import { getListingSchema, getListingSlugType } from '@/app/lib/publicListingUtils';
import { listPublicListings } from '@/app/lib/publicListingsService';

export const revalidate = 60;
export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ type?: string; area?: string; q?: string }>
}) {
  const params = await searchParams;
  const type = params.type || 'ALL';
  const area = params.area || '';
  const q = params.q || '';

  const { items: listings, total } = await listPublicListings({
    type: type === 'ALL' ? undefined : type,
    area,
    q,
  });

  const typeLabel = type === 'ALL' ? 'All' : type === 'rent' ? 'Rent' : type === 'sale' ? 'Sale' : 'Requirements';
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
        <div className="hero">
          <span className="eyebrow">Parsed from broker WhatsApp activity</span>
          <h1>Mumbai property listings that search engines can actually understand</h1>
          <p>Structured rent, sale, and requirement posts from broker networks with direct WhatsApp contact links where available.</p>
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

        <div className="results-summary">
          {total} {typeLabel.toLowerCase()} listings in Mumbai
          {area && ` in ${area}`}
        </div>

        {listings.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
            <p>No listings found. Try adjusting your filters.</p>
            <p style={{ marginTop: 8, fontSize: 13, color: '#999' }}>
              Listings appear here once WhatsApp messages are processed by PropAI Pulse.
            </p>
          </div>
        ) : (
          <div className="listing-grid">
            {listings.map(listing => <ListingCard key={listing.id} listing={listing} />)}
          </div>
        )}

        <section className="seo-block">
          <h2>Area routes built for indexing</h2>
          <p>
            Browse search-friendly landing pages for neighborhoods and listing intent:
            every parsed listing can roll up into area and type pages such as rent, sale, or requirement.
          </p>
          <div className="seo-links">
            {listings.slice(0, 6).map((listing) => {
              const areaName = listing.subArea || listing.area;
              if (!areaName) return null;
              return (
                <a
                  key={`${listing.id}-${areaName}`}
                  href={`/mumbai/${encodeURIComponent(areaName)}/${getListingSlugType(listing.type)}`}
                  className="seo-link"
                >
                  {areaName} {getListingSlugType(listing.type)}
                </a>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
