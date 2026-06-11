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
        // Light mode values (also used as static references)
        "bg-primary": "var(--color-bg-primary)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-card": "var(--color-bg-card)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        accent: "var(--color-accent)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        gold: "var(--color-gold)",
        live: "var(--color-live)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "6": "24px",
        "8": "32px",
        "12": "48px",
        "16": "64px",
      },
      borderRadius: {
        badge: "4px",
        button: "8px",
        card: "12px",
        sheet: "20px",
        avatar: "50%",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(0,0,0,.06)",
        gold: "0 0 0 2px #FFD60A, 0 4px 16px rgba(255,214,10,.2)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.32,0.72,0,1)",
      },
      transitionDuration: {
        feedback: "200ms",
        transition: "350ms",
      },
    },
  },
  plugins: [],
};

export default config;
