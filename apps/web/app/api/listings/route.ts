import { listPublicListings } from '@/app/lib/publicListingsService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || undefined;
  const area = searchParams.get('area') || undefined;
  const q = searchParams.get('q') || undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  const response = await listPublicListings({
    type,
    area,
    q,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json(response);
}
