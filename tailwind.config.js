/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Swavalambi Siddaganga Oil Mill Theme
        // Change these values here to update the entire website theme.
        brand: {
          DEFAULT: "#FF9933",
          accent: "#FF9933",
          background: "#FFF4E6",
          section: "#FFE8CC",
          hover: "#E67E22",
        },
        cream: "#FFF4E6",
        linen: "#FFE8CC",
        surface: "#FFF9F2",
        footer: "#FFE8CC",
        ink: "#402E20",
        clay: "#FF9933",
        leaf: "#E67E22",
        olive: "#9C6B30",
        danger: "#B23A2B",
        white: "#FFFFFF",
        transparent: "transparent",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 24px 70px rgba(64, 46, 32, 0.11)",
      },
    },
  },
  plugins: [],
};
