import { NextResponse } from "next/server";
import { createPublicLead } from "@/lib/publicListings";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const contentType = request.headers.get("content-type") || "";
  const body =
    contentType.includes("application/json")
      ? await request.json().catch(() => ({}))
      : Object.fromEntries(await request.formData());

  const listingId = String(body.listingId || "");
  const status = await createPublicLead({
    listingId,
    name: String(body.name || ""),
    phone: String(body.phone || ""),
    referer: request.headers.get("referer") || request.headers.get("referrer") || `/listings/${listingId}`,
    hostname: requestUrl.hostname,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.redirect(new URL(`/listings/${listingId}?lead=${status}`, request.url));
}
