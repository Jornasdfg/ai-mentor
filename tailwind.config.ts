import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Nunito = rond, warm en luchtig, maar uitstekend leesbaar. App-breed gebruikt.
        // "mono" wordt eveneens hierop gemapt zodat oude font-mono classes meegaan.
        sans: ['"Nunito"', "ui-rounded", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ['"Nunito"', "ui-rounded", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      colors: {
        // Vrolijke, luchtige look
        surface: "#f3f5fc",   // paginaachtergrond (zacht koel-warm)
        panel: "#ffffff",     // cards, panelen, headers
        border: "#e3e6f0",    // zachte hairline
        muted: "#6e6e80",     // secundaire tekst
        accent: "#5b6cff",    // vriendelijk indigo-blauw
        accent2: "#8b5cf6",   // violet (voor gradients/accenten)
        success: "#34c759",
        warning: "#ff9f0a",
        danger: "#ff3b30",
      },
      borderRadius: {
        lg: "14px",
        xl: "18px",
        "2xl": "22px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(30,40,90,0.06), 0 1px 2px rgba(30,40,90,0.04)",
        soft: "0 6px 22px rgba(40,50,110,0.08)",
        lift: "0 10px 30px rgba(40,50,110,0.14)",
      },
      keyframes: {
        msgIn: {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        popIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "msg-in": "msgIn 0.28s cubic-bezier(0.22,1,0.36,1)",
        "pop-in": "popIn 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
