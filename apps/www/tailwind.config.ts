import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        surface: "#0d1117",
        panel: "#111821",
        card: "#121a24",
        line: "#243040",
        accent: "#3EE88A",
        ink: "#f5f7fa",
        muted: "#95a3b8",
        propai: {
          green: "#3EE88A",
          "green-dark": "#2DC96E",
          "green-muted": "rgba(62, 232, 138, 0.25)",
          "green-dim": "rgba(62, 232, 138, 0.12)",
          "on-green": "#0D1A12"
        }
      },
      boxShadow: {
        card: "0 18px 48px rgba(0,0,0,0.24)"
      },
      fontFamily: {
        sans: ["var(--font-jakarta)"],
        display: ["var(--font-syne)"]
      }
    }
  },
  plugins: []
};

export default config;
