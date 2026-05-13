import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      colors: {
        surface: "#0f1117",
        panel: "#161b22",
        border: "#21262d",
        muted: "#8b949e",
        accent: "#58a6ff",
        success: "#3fb950",
        warning: "#d29922",
        danger: "#f85149",
      },
    },
  },
  plugins: [],
};

export default config;
