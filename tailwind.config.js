/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        line: "#d6dee8",
        forest: "#216869",
        coral: "#c8553d",
        gold: "#f4b860",
        mist: "#f7f9fb"
      }
    }
  },
  plugins: []
};
