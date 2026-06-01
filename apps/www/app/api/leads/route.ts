import { NextResponse } from "next/server";
import { createPublicLead } from "@/lib/publicListings";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const contentType = request.headers.get("content-type") || "";
  const acceptHeader = request.headers.get("accept") || "";
  
  const body =
    contentType.includes("application/json")
      ? await request.json().catch(() => ({}))
      : Object.fromEntries(await request.formData());

  const listingId = String(body.listingId || "");
  const name = String(body.name || "");
  const phone = String(body.phone || "");
  const answers = body.answers || null;

  const status = await createPublicLead({
    listingId,
    name,
    phone,
    referer: request.headers.get("referer") || request.headers.get("referrer") || `/listings/${listingId}`,
    hostname: requestUrl.hostname,
    userAgent: request.headers.get("user-agent"),
    answers: answers || undefined,
  });

  // If client prefers JSON (AJAX request from Pulse Chat Widget), return JSON response instead of redirect
  if (contentType.includes("application/json") || acceptHeader.includes("application/json")) {
    return NextResponse.json({ status, listingId });
  }

  return NextResponse.redirect(new URL(`/listings/${listingId}?lead=${status}`, request.url));
}
