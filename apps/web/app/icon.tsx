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
          background: "#090d12",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <svg width="512" height="512" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="16" fill="#090d12" />
          <path d="M37 6L18 35h13L27 58l19-29H33L37 6Z" fill="#3EE88A" />
          <path d="M37 6L18 35h13L27 58l19-29H33L37 6Z" fill="url(#glow)" opacity="0.18" />
          <defs>
            <linearGradient id="glow" x1="18" y1="6" x2="46" y2="58" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7CFFB2" />
              <stop offset="1" stopColor="#3EE88A" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    ),
    size,
  );
}
