import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: '/' works for Netlify/Vercel/custom domain
// For GitHub Pages project sites, set base to '/repo-name/'
export default defineConfig({
  plugins: [react()],
  base: '/',
})
