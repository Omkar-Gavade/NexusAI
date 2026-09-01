import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const MARKDOWN_DEPS =
  /node_modules[\\/](react-markdown|remark-|rehype-|micromark|mdast-|hast-|unist-|unified|vfile|bail|trough|devlop|zwitch|longest-streak|ccount|markdown-table|character-entities|decode-named-character-reference|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|trim-lines|is-plain-obj|estree-|@types[\\/]mdast)/;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // Same-origin in dev so cookies and the CSP's connect-src 'self' behave
      // exactly as they will in production.
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // The unified/remark ecosystem is ~40 transitive packages that do not
          // share a name prefix. Matching only "remark" leaves micromark, mdast
          // and hast in the entry path, which is most of the weight.
          if (MARKDOWN_DEPS.test(id)) return 'markdown';
          return 'vendor';
        },
      },
    },
  },
});
