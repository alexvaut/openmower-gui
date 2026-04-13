/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/MapEditorPage.tsx',
    './src/pages/OpenMowerPage.tsx',
    './src/components/mapEditor/**/*.{ts,tsx}',
    './src/components/commandCenter/**/*.{ts,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
