import { Header } from '@/app/components/Header';
import {
  formatPrice,
  generateDescription,
  getListingLocation,
  getListingSchema,
  getListingTypeLabel,
  getPrimaryContact,
} from '@/app/lib/publicListingUtils';
import { getPublicListingDetail } from '@/app/lib/publicListingsService';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Mumbai Property Listing | PropAI',
    description: 'Structured Mumbai property listing with parsed broker details and WhatsApp contact when available.',
    openGraph: {
      title: 'Mumbai Property Listing | PropAI',
      description: 'Structured Mumbai property listing with parsed broker details and WhatsApp contact when available.',
      type: 'website',
    }
  };
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const listing = await getPublicListingDetail(id);

  if (!listing) notFound();

  const location = getListingLocation(listing);
  const description = generateDescription(listing);
  const schemaOrg = getListingSchema(listing, 'https://www.propai.live');
  const contact = getPrimaryContact(listing);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
      />

      <Header />

      <main className="container listing-page">
        <a href="/" className="back-link">← Back to listings</a>

        <div className="listing-shell">
          <div className="listing-hero-row">
            <div>
              <span className={`listing-type ${listing.type}`} style={{ fontSize: 12, padding: '6px 12px' }}>
                {getListingTypeLabel(listing.type)}
              </span>
              <h1 className="listing-title">{location}</h1>
            </div>
            <div className="listing-price-panel">
              <div className="listing-price-big">{listing.price ? formatPrice(listing.price) : 'Price on request'}</div>
              {listing.priceType === 'monthly' && <div className="price-subtext">per month</div>}
            </div>
          </div>

          <div className="spec-grid">
            {listing.bhk && (
              <div className="spec-card">
                <div className="spec-label">Configuration</div>
                <div className="spec-value">{listing.bhk} BHK</div>
              </div>
            )}
            {listing.sizeSqft && (
              <div className="spec-card">
                <div className="spec-label">Area</div>
                <div className="spec-value">{listing.sizeSqft} sq ft</div>
              </div>
            )}
            {listing.furnishing && (
              <div className="spec-card">
                <div className="spec-label">Furnishing</div>
                <div className="spec-value">{listing.furnishing}</div>
              </div>
            )}
            {listing.propertyType && (
              <div className="spec-card">
                <div className="spec-label">Type</div>
                <div className="spec-value">{listing.propertyType}</div>
              </div>
            )}
          </div>

          <div className="content-block">
            <h2>About this property</h2>
            <p>{description}</p>
          </div>

          {listing.cleanedMessage && (
            <div className="content-block">
              <h2>Listing details</h2>
              <p className="listing-copy">
                {listing.cleanedMessage.slice(0, 500)}{listing.cleanedMessage.length > 500 ? '...' : ''}
              </p>
            </div>
          )}

          <div className="contact-panel">
            <p className="contact-kicker">Interested in this property?</p>
            {contact ? (
              <a
                href={contact.waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cta-btn cta-btn-large"
              >
                Chat on WhatsApp
              </a>
            ) : (
              <span className="contact-hidden">No broker WhatsApp number was parsed for this listing.</span>
            )}
            {contact?.name && <p className="contact-note">Broker: {contact.name}</p>}
            {!contact?.name && contact && <p className="contact-note">Direct broker WhatsApp contact</p>}
          </div>
        </div>
      </main>
    </>
  );
}
