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
        // used with an opacity modifier (bg-surface-elevated/50) — see the
        // primary/accent-text comment below for why this needs the rgb()
        // channel-triple form instead of a plain var() reference.
        "surface-elevated": "rgb(var(--color-surface-raised-rgb) / <alpha-value>)",
        foreground: "var(--foreground)",
        "foreground-secondary": "var(--foreground-secondary)",
        "foreground-muted": "var(--foreground-muted)",
        "foreground-disabled": "var(--foreground-disabled)",
        "foreground-inverse": "var(--foreground-inverse)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        "border-subtle": "var(--border-subtle)",
        "border-accent": "var(--border-accent)",
        "border-accent-hover": "var(--border-accent-hover)",
        // primary/accent-text are used with Tailwind opacity modifiers
        // (e.g. border-primary/20) in several components, so they're wired
        // to rgb(var(...) / <alpha-value>) via the *-rgb channel triples in
        // tokens.css rather than a plain var() — see the comment there.
        primary: "rgb(var(--color-accent-rgb) / <alpha-value>)",
        "primary-hover": "var(--primary-hover)",
        "primary-active": "var(--primary-active)",
        "primary-foreground": "var(--primary-foreground)",
        secondary: "var(--secondary)",
        "secondary-hover": "var(--secondary-hover)",
        "secondary-foreground": "var(--secondary-foreground)",
        "accent-text": "rgb(var(--color-accent-onDark-rgb) / <alpha-value>)",
        "accent-tint": "var(--accent-tint)",
        muted: "var(--muted)",
        "input-background": "var(--input-background)",
        "input-border": "var(--input-border)",
        "input-border-focus": "var(--input-border-focus)",
        "loader-track": "var(--loader-track)",
        "success-surface": "var(--success-surface)",
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
        "card-alt": "rgb(var(--color-surface-raised-rgb) / <alpha-value>)",
        "card-hover": "rgb(var(--color-surface-raised-rgb) / <alpha-value>)",
        // These two aliases are also used with opacity modifiers
        // (bg-accent/10, text-accent-light/80, ...) at several unmigrated
        // call sites, so — like primary/accent-text above — they need the
        // rgb() channel-triple form rather than pointing at var(--primary)/
        // var(--accent-text), which Tailwind can't decompose at build time.
        accent: "rgb(var(--color-accent-rgb) / <alpha-value>)",
        "accent-light": "rgb(var(--color-accent-onDark-rgb) / <alpha-value>)",
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
        "card-hover": "var(--shadow-card-hover)",
        "card-glow": "var(--shadow-card-glow)",
        frame: "var(--shadow-frame)",
        focus: "var(--focus-ring)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "ns-spin": { to: { transform: "rotate(360deg)" } },
        "ns-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "ns-pulse": { "0%,100%": { opacity: ".35" }, "50%": { opacity: "1" } },
        "ns-sheen": { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        "ns-spin": "ns-spin 800ms linear infinite",
        "ns-in": "ns-in 240ms ease-out",
        "ns-in-slow": "ns-in 300ms ease-out",
        "ns-pulse": "ns-pulse 1.2s ease-in-out infinite",
        "ns-sheen": "ns-sheen 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
