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
        background: "#0f0f0f",
        sidebar: "#141414",
        card: "#1a1a1a",
        "card-alt": "#222222",
        "card-hover": "#282828",
        accent: "#7c3aed",
        "accent-light": "#a78bfa",
        "accent-green": "#10b981",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.5)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
