/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#7C580D', on: '#FFFFFF', container: '#FFDEAB', 'on-container': '#5F4100' },
        secondary: { DEFAULT: '#6D5C3F', on: '#FFFFFF', container: '#F8DFBB', 'on-container': '#54442A' },
        tertiary: { DEFAULT: '#4E6543', on: '#FFFFFF', container: '#D0EBC0', 'on-container': '#374D2D' },
        error: { DEFAULT: '#BA1A1A', on: '#FFFFFF', container: '#FFDAD6', 'on-container': '#93000A' },
        background: { DEFAULT: '#FFF8F3', on: '#201B13' },
        surface: { DEFAULT: '#FFF8F3', on: '#201B13', variant: '#EEE0CF', 'on-variant': '#4E4539' },
        outline: { DEFAULT: '#807667', variant: '#D2C5B4' },
        'surface-container': { DEFAULT: '#F8ECDF', high: '#F2E6D9', highest: '#ECE1D4' },
      },
    },
  },
  plugins: [],
}
