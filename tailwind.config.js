/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Global brand accent color. Replace this value later to update brand highlights site-wide.
        brand: {
          DEFAULT: "#FF9933",
        },
        cream: "#F8F2E6",
        linen: "#E6D7B9",
        ink: "#402E20",
        clay: "#C97C2B",
        leaf: "#556B2F",
        olive: "#9C6B30",
        surface: "#FFF8EF",
        footer: "#E9DEC8",
        danger: "#B23A2B",
        white: "#FFFFFF",
        transparent: "transparent",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 24px 70px rgba(36, 31, 23, 0.10)",
      },
    },
  },
  plugins: [],
};
