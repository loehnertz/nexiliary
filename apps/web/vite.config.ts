import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installability and mid-match offline resilience: the app is entirely client
    // state once a match has started, so losing the network mid-match must not matter.
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // The default glob omits webp, which would leave the battleground renders to be
        // fetched on demand — exactly the thing that fails when signal drops mid-match.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
      manifest: {
        name: 'nexiliary',
        short_name: 'nexiliary',
        description: 'A companion for playing Heroes of the Storm',
        theme_color: '#0a0714',
        background_color: '#0a0714',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { port: 5173 },
})
