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
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        foreground: "var(--foreground)",
        "foreground-secondary": "var(--foreground-secondary)",
        "foreground-muted": "var(--foreground-muted)",
        "foreground-disabled": "var(--foreground-disabled)",
        "foreground-inverse": "var(--foreground-inverse)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "primary-active": "var(--primary-active)",
        "primary-foreground": "var(--primary-foreground)",
        secondary: "var(--secondary)",
        "secondary-hover": "var(--secondary-hover)",
        "secondary-foreground": "var(--secondary-foreground)",
        "accent-text": "var(--accent-text)",
        "accent-tint": "var(--accent-tint)",
        muted: "var(--muted)",
        danger: "var(--danger)",
        "danger-text": "var(--danger-text)",
        "danger-tint": "var(--danger-tint)",
        success: "var(--success)",
        "success-text": "var(--success-text)",
        "success-tint": "var(--success-tint)",
        warning: "var(--warning)",
        "warning-text": "var(--warning-text)",
        "warning-tint": "var(--warning-tint)",
        info: "var(--info)",
        "info-text": "var(--info-text)",
        "info-tint": "var(--info-tint)",

        // --- Deprecated pre-NextStage aliases ---
        // Old components still reference these Tailwind color names. Rather than
        // break every unmigrated screen at once, point them at the new tokens so
        // the whole app already renders the NextStage palette. Remove these once
        // the remaining components (tracked in the design-system cleanup ticket)
        // are migrated to the semantic names above.
        sidebar: "var(--surface)",
        card: "var(--surface)",
        "card-alt": "var(--surface-elevated)",
        "card-hover": "var(--surface-elevated)",
        accent: "var(--primary)",
        "accent-light": "var(--accent-text)",
        "accent-green": "var(--success)",
      },
      backgroundImage: {
        "gradient-brand": "var(--gradient-brand)",
        "gradient-brand-onDark": "var(--gradient-brand-onDark)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.5)",
        "card-glow": "0 0 0 1px rgba(147,51,234,0.08), 0 4px 20px rgba(0,0,0,0.5)",
        frame: "var(--shadow-frame)",
        focus: "var(--focus-ring)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
