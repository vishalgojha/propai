import { listPublicAreas } from '@/app/lib/publicListingsService';
import { NextResponse } from 'next/server';

export async function GET() {
  const response = await listPublicAreas();
  return NextResponse.json(response);
}
