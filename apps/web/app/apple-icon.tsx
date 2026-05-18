import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at top, rgba(180,106,45,0.18), transparent 34%), linear-gradient(180deg, #fbf7f0 0%, #f1eadf 100%)",
          borderRadius: 40,
          color: "#0D1A12",
          display: "flex",
          fontFamily: "Georgia, serif",
          fontSize: 68,
          fontWeight: 700,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        P
      </div>
    ),
    size,
  );
}
