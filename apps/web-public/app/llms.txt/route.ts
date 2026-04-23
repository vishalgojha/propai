import { getListings, formatPrice, generateDescription } from '@/app/lib/supabase';

export const revalidate = 3600;

export async function GET() {
  const listings = await getListings({ limit: 500 });

  const lines = [
    '# PropAI - Mumbai Property Listings',
    '',
    `Total listings: ${listings.length}`,
    '',
    '## Available Listings',
    ''
  ];

  for (const listing of listings) {
    const entry = listing.entries?.[0] || {};
    const location = [entry.sub_area, entry.area].filter(Boolean).join(', ');
    const type = entry.type === 'listing_rent' ? 'FOR RENT' : entry.type === 'listing_sale' ? 'FOR SALE' : 'REQUIREMENT';
    const price = entry.price ? formatPrice(entry.price) : 'Price on request';
    const description = generateDescription(listing);

    lines.push(`### ${location || 'Mumbai'} - ${type}`);
    lines.push(`Price: ${price}`);
    lines.push(`Description: ${description}`);
    lines.push(`URL: https://www.propai.live/listings/${listing.id}`);
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain' }
  });
}
