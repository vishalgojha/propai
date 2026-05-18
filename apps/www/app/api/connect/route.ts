import { NextResponse } from "next/server";
import { recordPublicWaClick } from "@/lib/publicListings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
  }

  try {
    const result = await recordPublicWaClick({
      listingId: id,
      forwardedFor: request.headers.get("x-forwarded-for") || "",
      userAgent: request.headers.get("user-agent") || "public-web",
    });

    if (!result) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (!result.phone) {
      return NextResponse.json({ error: "Broker contact not available" }, { status: 404 });
    }

    return NextResponse.redirect(
      `https://wa.me/91${result.phone}?text=${encodeURIComponent(
        "Hi, I saw your property listing on PropAI. Is it still available?"
      )}`
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to connect" },
      { status: 500 }
    );
  }
}
