import { defineConfig } from 'vite';
import sitePlugin, { fontPreloadPlugin } from './scripts/lib/vite-site.mjs';

export default defineConfig({
  plugins: [sitePlugin(), fontPreloadPlugin()],
  build: {
    target: 'es2020',
    // Fonts and SVGs must stay real files: the CSP only allows data: for images.
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
});
