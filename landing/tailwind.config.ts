import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CSS variables are used for colors, but keeping these for Tailwind utilities
        primary: {
          50: "#E6FFF9",
          100: "#CCFFF3",
          200: "#99FFE7",
          300: "#66FFDB",
          400: "#33FFCF",
          500: "#00FFC8",
          600: "#00CCA0",
          700: "#009978",
          800: "#006650",
          900: "#003328",
        },
        accent: {
          50: "#FFF3F0",
          100: "#FFE7DF",
          200: "#FFCFBF",
          300: "#FFB79F",
          400: "#FF9F7F",
          500: "#FF875F",
          600: "#FF6B35",
          700: "#E85D2D",
          800: "#CC4A24",
          900: "#99381B",
        },
        dark: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0A0A0F",
          950: "#050508",
        },
      },
      fontFamily: {
        display: ["Syne", "sans-serif"],
        body: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "slide-up": "slideUp 0.6s ease-out forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 8s ease-in-out infinite",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
        shimmer: "shimmer 2.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "33%": { transform: "translateY(-15px) rotate(1deg)" },
          "66%": { transform: "translateY(10px) rotate(-1deg)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.6" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "mesh-gradient": "radial-gradient(ellipse 60% 50% at 20% 30%, rgba(0, 255, 200, 0.15) 0%, transparent 50%), radial-gradient(ellipse 50% 60% at 80% 70%, rgba(255, 107, 53, 0.15) 0%, transparent 50%), radial-gradient(ellipse 40% 40% at 50% 50%, rgba(0, 255, 200, 0.05) 0%, transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;