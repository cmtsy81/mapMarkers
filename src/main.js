import { registerSW } from 'virtual:pwa-register' // <-- 1. BU YENİ SATIRI EN ÜSTE EKLE



// CSS Dosyaları
import './style.css'
import './map_style.css'
import './admin_locations_style.css'
import './admin_style.css'

// JavaScript Dosyaları - Sadece harita için
import './map_script.js'
import './map_mobile_script.js'

// Eğer admin paneli değilse script.js'i yükleme
if (window.location.pathname.includes('admin.html')) {
  import('./admin_script.js')
}

// PWA "Garson"unu (Service Worker) hemen çalıştır ve
// 'autoUpdate' (otomatik güncelleme) modunda kaydet.
registerSW({ immediate: true })
// --- DÜZELTME BİTTİ ---

console.log('✅ Tarihi Markers uygulaması yüklendi')