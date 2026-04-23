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
    const sd = listing.structured_data || {};
    const location = [sd.sub_area, sd.area].filter(Boolean).join(', ');
    const type = sd.type === 'listing_rent' ? 'FOR RENT' : sd.type === 'listing_sale' ? 'FOR SALE' : 'REQUIREMENT';
    const price = sd.price ? formatPrice(sd.price) : 'Price on request';
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
