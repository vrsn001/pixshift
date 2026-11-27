import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0b",
          secondary: "#111113",
          card: "#18181b",
        },
        text: {
          DEFAULT: "#f0efe9",
          secondary: "#9a9992",
          muted: "#8a8980",
        },
        acid: {
          DEFAULT: "#c8f03c",
          dark: "#9bbf2a",
          glow: "rgba(200, 240, 60, 0.15)",
          pink: "#f03c8c",
        },
        cobalt: {
          DEFAULT: "#2563eb",
          bright: "#60a5fa",
        },
      },
      fontFamily: {
        display: ["var(--font-syne)", "Syne", "sans-serif"],
        body: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 150ms ease-out",
        "pulse-slow": "pulse 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
