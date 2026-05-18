import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at top, rgba(180,106,45,0.22), transparent 34%), linear-gradient(180deg, #fbf7f0 0%, #f1eadf 100%)",
          color: "#0D1A12",
          display: "flex",
          fontFamily: "Georgia, serif",
          fontSize: 74,
          fontWeight: 700,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        P
      </div>
    ),
    { width: 192, height: 192 },
  );
}
