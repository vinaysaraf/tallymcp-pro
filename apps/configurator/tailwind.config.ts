import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        "tm-blue": "#0969da",
        "tm-blue-soft": "#ddf4ff",
        "tm-blue-deep": "#0a3069",
        "tm-green-soft": "#dafbe1",
        "tm-green-deep": "#1a7f37",
        "tm-amber-soft": "#fff8c5",
        "tm-amber-border": "#d4a72c",
        "tm-text": "#1f2328",
        "tm-text-muted": "#57606a",
        "tm-border": "#d0d7de",
        "tm-bg": "#f5f7fa",
        "tm-card": "#ffffff",
        "tm-code-bg": "#f6f8fa",
      },
    },
  },
  plugins: [],
} satisfies Config;
