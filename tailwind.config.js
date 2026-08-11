/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Swavalambi Siddaganga Oil Mill Theme
        // Change these values here to update the entire website theme.
        brand: {
          DEFAULT: "#1F3A24",
          accent: "#2F5D3A",
          background: "#FFFFFF",
          section: "#F7F7F5",
          hover: "#2F5D3A",
        },
        cream: "#FFFFFF",
        linen: "#F7F7F5",
        surface: "#F7F7F5",
        footer: "#1F3A24",
        ink: "#1F1F1F",
        clay: "#2F5D3A",
        leaf: "#2F5D3A",
        olive: "#66745F",
        danger: "#B23A2B",
        white: "#FFFFFF",
        transparent: "transparent",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 16px 42px rgba(31, 58, 36, 0.08)",
      },
    },
  },
  plugins: [],
};
