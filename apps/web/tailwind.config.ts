import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── Omzig Stitch Design System ───────────────────────── */
        primary: "#006a6a",
        "primary-container": "#00a3a3",
        "on-primary": "#ffffff",
        "on-primary-container": "#003131",

        tertiary: "#ba1a20",
        "tertiary-container": "#ff5851",
        "on-tertiary": "#ffffff",

        secondary: "#4a607c",
        "secondary-container": "#c5dcfd",
        "on-secondary": "#ffffff",

        surface: "#f7f9fb",
        "surface-bright": "#f7f9fb",
        "surface-dim": "#d8dadc",
        "surface-container": "#eceef0",
        "surface-container-low": "#f2f4f6",
        "surface-container-high": "#e6e8ea",
        "surface-container-highest": "#e0e3e5",
        "surface-container-lowest": "#ffffff",

        "on-surface": "#191c1e",
        "on-surface-variant": "#3d4949",
        "on-background": "#191c1e",
        background: "#f7f9fb",

        outline: "#6d7a79",
        "outline-variant": "#bcc9c8",

        error: "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error": "#ffffff",

        "inverse-surface": "#2d3133",
        "inverse-on-surface": "#eff1f3",
        "inverse-primary": "#5dd9d8",

        /* ── Legacy aliases ───────────────────────────────────── */
        omzig: {
          50: "#e0f7f7",
          100: "#b3ecec",
          200: "#80e0e0",
          500: "#00a3a3",
          600: "#006a6a",
          700: "#004f4f",
          800: "#001a33",
          900: "#001122",
        },
        navy: "#001a33",
      },
      fontFamily: {
        headline: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
        label: ["Inter", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem",
      },
      boxShadow: {
        lift: "0 20px 40px rgba(25, 28, 30, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
