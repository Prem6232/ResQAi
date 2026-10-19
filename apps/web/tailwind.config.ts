import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          50: "#FBF8F2",
          100: "#F6F4EF",
          200: "#EDE8DC",
        },
        ink: {
          700: "#2A3140",
          800: "#1C2230",
          900: "#121826",
        },
        sos: {
          50: "#FDECEC",
          100: "#F8D0D0",
          500: "#E23B3B",
          600: "#C81E1E",
        },
        duty: {
          50: "#E8F7F0",
          500: "#1B9A64",
          600: "#147A4E",
        },
        command: {
          50: "#E7F6F4",
          500: "#0F8A7A",
          600: "#0B6E62",
        },
        warn: {
          50: "#FFF6E8",
          500: "#D97706",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "12px",
        xl: "16px",
        "2xl": "22px",
        "3xl": "28px",
      },
      boxShadow: {
        card: "0 10px 30px -18px rgba(18, 24, 38, 0.28)",
        sos: "0 18px 40px -16px rgba(226, 59, 59, 0.55)",
      },
      fontFamily: {
        sans: ["Sora", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "Sora", "ui-sans-serif", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
