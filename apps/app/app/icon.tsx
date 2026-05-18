import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at top left, rgba(62,232,138,0.28), transparent 34%), linear-gradient(180deg, #07111a 0%, #0f1722 100%)",
          color: "#3EE88A",
          display: "flex",
          fontSize: 188,
          fontWeight: 800,
          height: "100%",
          justifyContent: "center",
          letterSpacing: "-0.08em",
          width: "100%",
        }}
      >
        P
      </div>
    ),
    size,
  );
}
