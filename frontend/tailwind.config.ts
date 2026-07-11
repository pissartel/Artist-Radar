import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0b10",
        sidebar: "#0d0e13",
        card: "#121318",
        "card-alt": "#16171f",
        "card-hover": "#1a1c27",
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
