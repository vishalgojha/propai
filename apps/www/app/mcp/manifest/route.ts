import { NextResponse } from "next/server";
import { MCP_MANIFEST } from "@/lib/mcp";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(MCP_MANIFEST, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
