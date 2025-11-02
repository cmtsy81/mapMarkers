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
  import('./script.js')
}

console.log('✅ Tarihi Markers uygulaması yüklendi')