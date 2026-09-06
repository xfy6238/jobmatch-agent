/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a1c1e",
        paper: "#fafaf8",
        "paper-warm": "#f7f5f1",
        line: "#e8e6e1",
        // alias keep compat with existing `border-*` utilities in pages
        border: "#e8e6e1",
        stone: "#78716c",
        muted: "#78716c",
        accent: "#5a6c5e",
        "accent-soft": "rgba(90,108,94,0.08)",
        "accent-line": "rgba(90,108,94,0.18)",
        // compat: pages still reference success/amber but keep muted earthy
        success: "#5a6c5e",
        warning: "#8a7a65",
      },
      fontFamily: {
        sans: ["Geist", "'Geist Sans'", "Satoshi", "system-ui", "sans-serif"],
        serif: ["Newsreader", "'Noto Serif SC'", "serif"],
        mono: ["Geist Mono", "'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
      },
      maxWidth: {
        content: "1280px",
      },
      boxShadow: {
        card: "0 2px 20px rgba(0,0,0,0.04)",
        "card-hover": "0 8px 30px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
