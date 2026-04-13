/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/MapEditorPage.tsx',
    './src/components/mapEditor/**/*.{ts,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
