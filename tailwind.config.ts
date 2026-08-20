import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Instrument Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        editorial: [
          "var(--font-editorial)",
          "Newsreader",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        canvas: "var(--bg-canvas)",
        sidebar: "var(--bg-sidebar)",
        surface: {
          1: "var(--bg-surface-1)",
          2: "var(--bg-surface-2)",
          3: "var(--bg-surface-3)",
        },
        background: "var(--bg-canvas)",
        foreground: "var(--text-primary)",
        card: {
          DEFAULT: "var(--bg-surface-1)",
          foreground: "var(--text-primary)",
        },
        popover: {
          DEFAULT: "var(--bg-surface-1)",
          foreground: "var(--text-primary)",
        },
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-contrast)",
        },
        secondary: {
          DEFAULT: "var(--bg-surface-2)",
          foreground: "var(--text-primary)",
        },
        muted: {
          DEFAULT: "var(--bg-surface-2)",
          foreground: "var(--text-secondary)",
        },
        accent: {
          DEFAULT: "var(--accent-subtle)",
          foreground: "var(--accent)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "#ffffff",
        },
        border: "var(--border-default)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        input: "var(--border-default)",
        ring: "var(--accent)",
        status: {
          success: "var(--success)",
          "success-subtle": "var(--success-subtle)",
          warning: "var(--warning)",
          "warning-subtle": "var(--warning-subtle)",
          danger: "var(--danger)",
          "danger-subtle": "var(--danger-subtle)",
          info: "var(--info)",
          "info-subtle": "var(--info-subtle)",
        },
      },
      textColor: {
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        tertiary: "var(--text-tertiary)",
      },
      borderRadius: {
        xs: "6px",
        sm: "8px",
        md: "10px",
        lg: "14px",
        xl: "16px",
      },
      boxShadow: {
        xs: "var(--shadow-sm)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      keyframes: {
        entrance: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        entrance: "entrance 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.15s ease-out",
        "slide-down": "slide-down 0.15s ease-out",
        "slide-up": "slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
