import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Apple system stack — ook gemapt op "mono" zodat bestaande font-mono classes
        // automatisch de strakke Apple-sans krijgen i.p.v. een terminal-monospace.
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', '"SF Pro"', '"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', '"SF Pro"', '"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      colors: {
        // Apple "white" look
        surface: "#f5f5f7",   // paginaachtergrond (Apple licht­grijs)
        panel: "#ffffff",     // cards, panelen, headers
        border: "#d2d2d7",    // hairline grijs
        muted: "#6e6e73",     // secundaire tekst
        accent: "#0071e3",    // Apple blauw
        success: "#34c759",
        warning: "#ff9f0a",
        danger: "#ff3b30",
      },
      borderRadius: {
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
