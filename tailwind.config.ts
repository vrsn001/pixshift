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
          muted: "#5a5952",
        },
        acid: {
          DEFAULT: "#c8f03c",
          dark: "#9bbf2a",
          glow: "rgba(200, 240, 60, 0.15)",
          pink: "#f03c8c",
        },
      },
      fontFamily: {
        display: ["var(--font-syne)", "Syne", "sans-serif"],
        body: ["var(--font-dm-sans)", "DM Sans", "sans-serif"],
      },
      animation: {
        "float-1": "float1 14s ease-in-out infinite",
        "float-2": "float2 18s ease-in-out infinite reverse",
        "pulse-slow": "pulse 2s ease-in-out infinite",
      },
      keyframes: {
        float1: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(25px, -15px) scale(1.04)" },
        },
        float2: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(-20px, 20px) scale(0.96)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
