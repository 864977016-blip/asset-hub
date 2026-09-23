import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        orange: { brand: "#ff6b00", deep: "#e75f00" },
        canvas: "#f7f7f5",
        ink: "#171717",
      },
      boxShadow: { card: "0 1px 2px rgba(0,0,0,.04)", float: "0 18px 35px rgba(0,0,0,.12)" },
    },
  },
  plugins: [],
} satisfies Config;
