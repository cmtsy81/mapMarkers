// vite.config.js

import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa' // <-- 1. YENİ İÇE AKTARMA (import)

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
  plugins: [ // <-- 2. YENİ EKLENTİ BLOĞU
    VitePWA({
      // Bu ayar, 'sw.js' (Service Worker) dosyasını otomatik olarak oluşturur.
      registerType: 'autoUpdate', 
      
      // 'public' klasöründeki hangi dosyaların da 'Garson' tarafından
      // çevrimdışı kullanım için hemen cache'lenmesi gerektiğini söyler.
      includeAssets: [
        'favicon.ico', 
        '*.png', // Tüm pinleri ve resimleri alır
        '*.jpg', // Tüm şehir resimlerini alır
        '*.apng' // Animasyonlu pinleri alır
      ],
      
      // Bu, uygulamanın 'manifest' dosyasıdır.
      // Telefonlarda "Ana Ekrana Ekle" özelliği buradan gelir.
      manifest: {
        name: 'Seyahat Haritası',
        short_name: 'Haritam',
        description: 'Gezdiğim yerlerin haritası',
        theme_color: '#ffffff',
        icons: [
          {
            // Not: Buraya 192x192 ve 512x512 boyutlarında
            // gerçek ikonlar (örn: public/icons/icon-192.png)
            // koymamız gerekecek. Şimdilik pin'i kullanalım.
            src: 'pin_default.png', 
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})