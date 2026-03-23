import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── Omzig brand (from omzig.it) ──────────────────────── */
        omzig: {
          50: "#eaf6ff",
          100: "#d0ecff",
          200: "#a8daff",
          300: "#6ec1ff",
          400: "#2ea3f2", // ← primary
          500: "#1a8fd9",
          600: "#1477b8",
          700: "#0f5f96",
          800: "#0a4570",
          900: "#072d4a",
        },
      },
      fontFamily: {
        sans: ['"Open Sans"', "Arial", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "3px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0, 0, 0, 0.06)",
        lift: "0 4px 16px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
