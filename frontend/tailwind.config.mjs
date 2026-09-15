/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#07070b",
        surface: {
          50: "#181824",
          100: "#12121c",
          200: "#0d0d16",
          300: "#08080f",
        },
        border: "#232332",
        brand: {
          purple: "#9333ea",
          violet: "#8b5cf6",
          cyan: "#06b6d4",
          emerald: "#10b981",
          rose: "#f43f5e",
          amber: "#f59e0b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["DM Mono", "Courier New", "monospace"],
      },
      animation: {
        "scan-line": "scanLine 2.2s ease-in-out infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        scanLine: {
          "0%, 100%": { top: "15%" },
          "50%": { top: "85%" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
