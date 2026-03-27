import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
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
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        game: {
          correct: "hsl(var(--game-correct))",
          present: "hsl(var(--game-present))",
          absent: "hsl(var(--game-absent))",
          empty: "hsl(var(--game-empty))",
          border: "hsl(var(--game-border))",
          "border-active": "hsl(var(--game-border-active))",
          text: "hsl(var(--game-text))",
          "key-bg": "hsl(var(--game-key-bg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "flip": {
          "0%": {
            transform: "rotateX(0)",
          },
          "50%": {
            transform: "rotateX(-90deg)",
          },
          "100%": {
            transform: "rotateX(0)",
          },
        },
        "flip-reveal": {
          "0%": {
            transform: "rotateX(0)",
            backgroundColor: "hsl(var(--game-empty))",
            borderColor: "hsl(var(--game-border))",
            color: "hsl(var(--game-text))",
          },
          "49.999%": {
            transform: "rotateX(-90deg)",
            backgroundColor: "hsl(var(--game-empty))",
            borderColor: "hsl(var(--game-border))",
            color: "hsl(var(--game-text))",
          },
          "50%": {
            transform: "rotateX(-90deg)",
            backgroundColor: "var(--flip-bg)",
            borderColor: "var(--flip-border)",
            color: "var(--flip-text)",
          },
          "100%": {
            transform: "rotateX(0)",
            backgroundColor: "var(--flip-bg)",
            borderColor: "var(--flip-border)",
            color: "var(--flip-text)",
          },
        },
        "bounce-in": {
          "0%": {
            transform: "scale(0.8)",
            opacity: "0",
          },
          "50%": {
            transform: "scale(1.1)",
          },
          "100%": {
            transform: "scale(1)",
            opacity: "1",
          },
        },
        "shake": {
          "0%, 100%": {
            transform: "translateX(0)",
          },
          "25%": {
            transform: "translateX(-10px)",
          },
          "75%": {
            transform: "translateX(10px)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "flip": "flip 0.6s ease-in-out",
        "flip-reveal": "flip-reveal 0.6s ease-in-out both",
        "bounce-in": "bounce-in 0.3s ease-out",
        "shake": "shake 0.4s ease-in-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
