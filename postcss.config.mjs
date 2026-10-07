// PostCSS pipeline for the renderer (Tailwind v4).
// NOTE: we intentionally do NOT use @tailwindcss/vite here: electron-vite's
// config merge silently drops/ignores that plugin, which left zero Tailwind
// utilities in the built CSS (unstyled, transparent-looking palette).
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
