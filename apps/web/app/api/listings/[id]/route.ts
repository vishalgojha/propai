import { getPublicListingDetail } from '@/app/lib/publicListingsService';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getPublicListingDetail(id);

  if (!item) {
    return NextResponse.json({ item: null }, { status: 404 });
  }

  return NextResponse.json({ item });
}
