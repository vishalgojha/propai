import { NextResponse } from "next/server";
import { fetchPublicListingBySlug, fetchPublicListings } from "@/lib/publicListings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const locality = searchParams.get("locality");

    if (slug) {
      const listing = await fetchPublicListingBySlug(slug);
      return NextResponse.json({ listing });
    }

    const listings = await fetchPublicListings(locality || undefined);
    return NextResponse.json({ listings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch listings" },
      { status: 500 }
    );
  }
}
