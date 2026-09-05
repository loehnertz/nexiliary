import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

/**
 * `NEXILIARY_HTTPS=1` serves the dev server over TLS with a self-signed certificate.
 *
 * This is not a nicety. Screen Wake Lock requires a secure context, so on a plain
 * `http://192.168.x.x` address the API is simply absent and the phone's screen sleeps
 * mid-match — which is what happened in the first real playtest. `localhost` is a secure
 * context and a LAN address is not, so the phone is exactly the case that needs this.
 */
const https = process.env.NEXILIARY_HTTPS === '1'

export default defineConfig({
  plugins: [
    react(),
    ...(https ? [basicSsl()] : []),
    tailwindcss(),
    // Installability and mid-match offline resilience: the app is entirely client
    // state once a match has started, so losing the network mid-match must not matter.
    VitePWA({
      registerType: 'autoUpdate',
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
