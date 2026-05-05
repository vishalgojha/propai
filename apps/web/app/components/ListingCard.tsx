import Link from 'next/link';
import {
  formatPrice,
  getListingLocation,
  getListingTypeLabel,
  getPrimaryContact,
} from '@/app/lib/publicListingUtils';
import { PublicListingSummary } from '@/app/lib/publicListingTypes';

export function ListingCard({ listing }: { listing: PublicListingSummary }) {
  const contact = getPrimaryContact(listing);

  return (
    <article className="listing-card">
      <div className="listing-header">
        <span className={`listing-type ${listing.type}`}>
          {getListingTypeLabel(listing.type)}
        </span>
        <span className="listing-date">
          {listing.postedAt ? new Date(listing.postedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
        </span>
      </div>

      <div className="listing-price">
        {listing.price ? formatPrice(listing.price, listing.priceType || undefined) : 'Price on request'}
      </div>

      <div className="listing-details">
        <div className="listing-area">{getListingLocation(listing)}</div>
        <div className="listing-meta">
          {listing.bhk && <span>{listing.bhk} BHK</span>}
          {listing.propertyType && <span>{listing.propertyType}</span>}
          {listing.sizeSqft && <span>{listing.sizeSqft} sq ft</span>}
          {listing.furnishing && <span>{listing.furnishing}</span>}
        </div>
      </div>

      <div className="listing-footer">
        {contact ? (
          <a
            href={contact.waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="wa-btn"
          >
            WhatsApp Broker
          </a>
        ) : (
          <span className="contact-hidden">Broker contact unavailable</span>
        )}
        <Link href={`/listings/${listing.id}`} className="cta-btn">View Details</Link>
      </div>
    </article>
  );
}
