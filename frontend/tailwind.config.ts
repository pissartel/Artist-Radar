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
        background: "#0d0f1a",
        sidebar: "#111422",
        card: "#181c2c",
        "card-alt": "#1e2237",
        "card-hover": "#232843",
        accent: "#7c3aed",
        "accent-light": "#a78bfa",
        "accent-green": "#10b981",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.6)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.5)",
        "card-glow": "0 0 0 1px rgba(124,58,237,0.08), 0 4px 20px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
