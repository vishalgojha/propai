import { getPublicSitemapFeed } from '@/app/lib/publicListingsService';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  const response = await getPublicSitemapFeed(Number.isFinite(limit) ? limit : undefined);
  return NextResponse.json(response);
}
