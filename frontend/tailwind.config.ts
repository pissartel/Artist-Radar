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
        sidebar: "#1a1a1a",
        card: "#1e1e1e",
        "card-alt": "#252525",
        accent: "#7c3aed",
        "accent-light": "#a78bfa",
      },
    },
  },
  plugins: [],
};

export default config;
