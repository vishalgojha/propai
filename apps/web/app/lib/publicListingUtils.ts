import {
  PublicListingContact,
  PublicListingDetail,
  PublicListingSummary,
  PublicListingType,
} from '@/app/lib/publicListingTypes';

export function formatPrice(price: number, priceType?: string): string {
  if (!price) return 'Price on request';
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)}Cr`;
  if (price >= 100000) return `₹${(price / 100000).toFixed(2)}L`;
  return `₹${price.toLocaleString('en-IN')}`;
}

export function getListingTypeLabel(listingType: PublicListingType): string {
  if (listingType === 'rent') return 'For Rent';
  if (listingType === 'sale') return 'For Sale';
  return 'Requirement';
}

export function getListingLocation(
  listing: Pick<PublicListingSummary, 'location' | 'subArea' | 'area'>
): string {
  return listing.location || [listing.subArea, listing.area].filter(Boolean).join(', ') || 'Mumbai';
}

export function getListingSlugType(listingType: PublicListingType): PublicListingType {
  return listingType;
}

export function getPrimaryContact(
  listing: Pick<PublicListingSummary, 'contact'>
): PublicListingContact | null {
  if (!listing.contact) {
    return null;
  }

  const normalized = normalizeIndianPhoneNumber(listing.contact.number);
  if (!normalized) {
    return null;
  }

  return {
    ...listing.contact,
    number: normalized,
    waUrl: `https://wa.me/${normalized}`,
  };
}

function normalizeIndianPhoneNumber(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('0091') && digits.length === 14) {
    digits = digits.slice(4);
  } else if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }

  return `91${digits}`;
}

export function generateDescription(
  listing: Pick<
    PublicListingDetail,
    'description' | 'bhk' | 'propertyType' | 'location' | 'sizeSqft' | 'furnishing' | 'price' | 'priceType' | 'cleanedMessage' | 'rawMessage'
  >
): string {
  if (listing.description?.trim()) {
    return listing.description;
  }

  const parts = [];
  if (listing.bhk) parts.push(`${listing.bhk} BHK`);
  if (listing.propertyType) parts.push(listing.propertyType);
  if (listing.location) parts.push(`in ${listing.location}`);
  if (listing.sizeSqft) parts.push(`${listing.sizeSqft} sq ft`);
  if (listing.furnishing) parts.push(listing.furnishing);
  if (listing.price && listing.priceType) {
    const formatted = formatPrice(listing.price, listing.priceType);
    parts.push(`at ${formatted}${listing.priceType === 'monthly' ? '/month' : ''}`);
  }
  return parts.join(' ') || listing.cleanedMessage || listing.rawMessage || 'Property listing';
}

export function getListingTitle(
  listing: Pick<PublicListingSummary, 'title' | 'location' | 'subArea' | 'area' | 'bhk' | 'propertyType'>
): string {
  if (listing.title?.trim()) {
    return listing.title;
  }

  const location = getListingLocation(listing);
  const details = [listing.bhk ? `${listing.bhk} BHK` : null, listing.propertyType].filter(Boolean).join(' ');
  return [details, location].filter(Boolean).join(' in ') || location;
}

export function getListingSchema(
  listing: PublicListingSummary,
  baseUrl: string
) {
  const contact = getPrimaryContact(listing);
  const url = `${baseUrl}/listings/${listing.id}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: getListingTitle(listing),
    description: listing.description,
    url,
    datePosted: listing.postedAt,
    identifier: listing.id,
    ...(listing.price && {
      offers: {
        '@type': 'Offer',
        price: listing.price,
        priceCurrency: 'INR',
        url,
      },
    }),
    location: {
      '@type': 'Place',
      name: getListingLocation(listing),
      address: {
        '@type': 'PostalAddress',
        addressLocality: listing.subArea || listing.area || 'Mumbai',
        addressRegion: 'Maharashtra',
        addressCountry: 'IN',
      },
    },
    ...(contact && {
      seller: {
        '@type': 'RealEstateAgent',
        name: contact.name || 'Broker',
        telephone: `+${contact.number}`,
        url: contact.waUrl,
      },
    }),
  };
}
