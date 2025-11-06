import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        admin: './admin.html',
        paketler: './paketler.html'
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', 
      includeAssets: [
        'favicon.ico', 
        '*.png',
        '*.jpg',
        '*.apk'
      ],
      manifest: {
        name: 'Seyahat Haritası',
        short_name: 'Haritam',
        description: 'Gezdiğim yerlerin haritası',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pin_default.png', 
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      },
      // ← BURAYA EKLE
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/mapmarkers\.onrender\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapmarkers-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: /^https:\/\/history-markers\.onrender\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50
              }
            }
          }
        ]
      }
    })
  ]
})