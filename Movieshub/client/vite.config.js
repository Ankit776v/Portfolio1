import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.PORTFOLIO_BUILD === "1" ? "/movieshub/" : "/",
  build: {
    manifest: true,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: { main: 'index.html', portfolio: 'src/portfolio.jsx' },
    },
  },
   server: {
    proxy: { "/api": { target: "http://localhost:5000", changeOrigin: true } },
    watch: {
      usePolling: true, // Forces Vite to check files on a timer
    },
  },
  plugins: [react()],
})
