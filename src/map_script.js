/*
 * File: map_script.js (VİTE UYUMLULUK DÜZELTMESİ)
 * Açıklama: Tüm global değişkenler ve fonksiyonlar, mobil script (ezme) 
 * ile uyumluluk için 'window' nesnesine taşındı.
 */

// --- SABİTLER ---
//const API_BASE = "http://localhost:3000/api/v1";
const API_BASE = "https://history-markers.onrender.com/api/v1";

const INDEX_CACHE_TIME = 5 * 60 * 1000; // 5 dakika (development)
const DETAIL_CACHE_TIME = 24 * 60 * 60 * 1000; // 24 saat
const MIN_ZOOM_TO_SHOW_LIST = 13;
const CLUSTER_THRESHOLD = 50; // Cluster'da bu sayıdan az marker varsa detayları indir

// --- CUSTOM MARKER İKONLARI ---
const pinDefaultIcon = L.icon({ // <-- DEĞİŞKEN ADINI DA GÜNCELLEDİK
  iconUrl: '/pin_default.png', 
  iconSize: [40, 25],
  iconAnchor: [20, 32],
  popupAnchor: [0, -32]
});

const pinSelectedIcon = L.icon({ // <-- DEĞİŞKEN ADINI DA GÜNCELLEDİK
  iconUrl: '/pin_selected.png', 
  iconSize: [45, 25],
  iconAnchor: [20, 32],
  popupAnchor: [0, -32]
});

// --- GLOBAL DEĞİŞKENLER (VİTE İÇİN 'window' KULLANILIYOR) ---
window.map;
window.markerClusterGroup;
window.geoIndexData = [];
window.detailCache = new Map();
window.currentHeavyLocation = null;
window.currentLang = 'tr';
window.allCategories = {};
window.allCities = {};
window.selectedLocationId = null;
window.markerMap = {};
window.db;
window.lastIndexFetch = 0;

// --- İNDEXEDDB BAŞLATMA ---
async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('travelAppCache', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      window.db = request.result; // DÜZELTİLDİ
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result; // BU LOKAL KALMALI, DOĞRU.

      // Marker detayları store
      if (!db.objectStoreNames.contains('markerDetails')) {
        const detailStore = db.createObjectStore('markerDetails', { keyPath: 'id' });
        detailStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Index verisi store
      if (!db.objectStoreNames.contains('geoIndex')) {
        db.createObjectStore('geoIndex', { keyPath: 'cacheKey' });
      }
    };
  });
}

// --- İNDEXEDDB CACHE FONKSIYONLARI ---

async function getFromIndexedDB(storeName, key) {
  return new Promise((resolve, reject) => {
    if (!window.db) { // DÜZELTİLDİ
      reject(new Error('IndexedDB not initialized'));
      return;
    }
    const tx = window.db.transaction([storeName], 'readonly'); // DÜZELTİLDİ
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        console.log(`📦 IndexedDB get: ${key}`, result);
      }
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveToIndexedDB(storeName, data) {
  return new Promise((resolve, reject) => {
    if (!window.db) { // DÜZELTİLDİ
      reject(new Error('IndexedDB not initialized'));
      return;
    }
    const tx = window.db.transaction([storeName], 'readwrite'); // DÜZELTİLDİ
    const store = tx.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => {
      console.log(`💾 IndexedDB save: ${data.id || data.cacheKey}`);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function isCacheValid(timestamp, maxAge) {
  return (Date.now() - timestamp) < maxAge;
}

// --- HAL KONTROL ---

function isOnline() {
  return navigator.onLine;
}

function showNotification(message, type = 'info') {
  // type: 'info', 'warning', 'error'
  console.log(`[${type.toUpperCase()}] ${message}`);
  // İleride Toast kütüphanesi eklenebilir
}

// --- HARITA VE VERİ BAŞLATMA ---

// DOSYA: map_script.js
// ESKİ initMap() FONKSİYONUNU BUNUNLA DEĞİŞTİR:

// map_script.js - initMap() FONKSIYONUNU ŞÖYLE GÜNCELLEYİN:

function initMap() {
  
  // --- 1. HARÄ°TA KATMANLARINI TANIMLA ---
  
  // Katman 1: Sokak HaritasÄ± (Mevcut haritan)
  const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Â© OpenStreetMap',
    maxZoom: 19
  });

  // Katman 2: Uydu HaritasÄ± (Admin panelindeki gibi)
  // (ESRI'nin Ã¼cretsiz ve yÃ¼ksek kaliteli uydu servisini kullanÄ±yoruz)
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Kaynak: Esri, i-cubed, USDA, USGS...',
    maxZoom: 19
  });

  // --- 2. HARÄ°TAYI BAÅžLAT ---
  
  // HaritayÄ±, varsayÄ±lan katman (Sokak) yÃ¼klÃ¼ olarak baÅŸlat
  window.map = L.map('map', {
    layers: [streetLayer] // VarsayÄ±lan olarak 'streetLayer'Ä± yÃ¼kle
  }).setView([50.0, 15.0], 5);

  // --- 3. KATMAN KONTROL MENÃœSÃœNÃœ EKLE ---

  // KullanÄ±cÄ±nÄ±n seÃ§ebileceÄŸi haritalarÄ±n listesi
  const baseMaps = {
    "Sokak": streetLayer,
    "Uydu": satelliteLayer
  };

  // --- HER YERDE GÃ–RÃœNÃœNSÜN: Layer control'u her zaman sol altta ekle ---
  // Masaüstü: Direkt gözükür
  // Mobil: Leaflet kontrol sol altta kalır (gizli değil), floating controls sağ üste ek butonlar sağlar
  L.control.layers(
    baseMaps, 
    null, // Overlay (ikinci) bir katman grubumuz olmadığı için 'null'
    { position: 'bottomleft' } // Sol alt köşe
  ).addTo(window.map);

  // --- 4. CLUSTER GRUBUNU EKLE (DeÄŸiÅŸiklik yok) ---
  window.markerClusterGroup = L.markerClusterGroup(); 
  window.map.addLayer(window.markerClusterGroup); 

  // --- 5. DÄ°NLEYÄ°CÄ°LERÄ° EKLE (DeÄŸiÅŸiklik yok) ---
  window.markerClusterGroup.on('clusterclick', handleClusterClick); 

  window.map.on('moveend', async () => { 
    await updateMapMarkers();
    updateLocationList();
  });
}

// NOT: Bu initMap() fonksiyonu map_script.js'deki mevcut initMap() fonksiyonunu TAMAMEN DEÄžÄ°ÅžTÄ°RECEK.
// Geri kalanÄ± (handleClusterClick, loadClusterDetails vb.) aynÄ± kalacak.

// --- OPSÄ°YONEL: Mobil CSS gizleme (Eğer çok dar ekranda layer kontrol sorunsa) ---
// Bu kodu HTML <head> veya CSS dosyasına ekleyebilirsin (opsiyonel):
/*
@media (max-width: 480px) {
  .leaflet-control-layers {
    font-size: 12px;
  }
  .leaflet-control-layers-toggle {
    width: 36px;
    height: 36px;
  }
}
*/




/**
 * Cluster'a tıklandığında çalışır
 */
function handleClusterClick(e) {
  const cluster = e.layer;
  const childCount = cluster.getChildCount();

  console.log(`Cluster tıklandı. İçinde ${childCount} marker var.`);

  if (childCount <= CLUSTER_THRESHOLD) {
    // Cluster'daki marker ID'lerini topla
    const markerIds = [];
    cluster.getAllChildMarkers().forEach(marker => {
      const markerId = marker.options.locationId;
      if (markerId) markerIds.push(markerId);
    });

    console.log(`${childCount} marker'ın detayları indiriliyor...`);
    loadClusterDetails(markerIds);
  } else {
    showNotification(`Daha fazla yakınlaşın (${childCount} marker)`, 'info');
  }

  // Zoom işlemi yap (markerClusterGroup kullanarak)
  window.markerClusterGroup.zoomToShowLayer(cluster, function () { // DÜZELTİLDİ
    console.log("Optimal zoom tamamlandı.");
  });
}





// DOSYA: map_script.js
// ESKİ loadClusterDetails FONKSİYONUNU BUNUNLA DEĞİŞTİR:

/**
 * Cluster'daki markerların detaylarını indir (AKILLI CACHE VERSİYONU)
 */
async function loadClusterDetails(markerIds) {
  if (!markerIds || markerIds.length === 0) return;

  const toFetch = []; // API'den çekileceklerin listesi
  const cached = {};  // Zaten cache'de olan (ve taze olan) verilerin listesi

  // --- "TANE TANE" KONTROL DÖNGÜSÜ ---
  // Cluster'daki her bir 'id' için:
  for (let id of markerIds) {
    try {
      
      // 1. "Ağır" Cache'i Kontrol Et (IndexedDB'de ne var?)
      const dbCached = await getFromIndexedDB('markerDetails', id);
      
      // 2. "Hafif" Veriyi Kontrol Et (Olması gereken 'lastUpdated' ne?)
      const indexItem = window.geoIndexData.find(item => item.id === id);
      const trueLastUpdated = indexItem ? indexItem.lastUpdated : null; // "Hakikatin" zaman damgası

      // 3. "Akıllı" Kuralı Uygula (SENİN MANTIĞIN)
      //    "Aptal" 1 hafta kuralı (isTimeValid) buradan kaldırıldı.
      const isDataValid = dbCached && trueLastUpdated && dbCached.data.lastUpdated === trueLastUpdated;

      if (isDataValid) {
        // VERİ GEÇERLİ: Cache'i kullan
        console.log(`✅ Cluster Cache (Veri Doğrulandı): ${id}`);
        cached[id] = dbCached.data;
      } else {
        // VERİ BAYAT veya YOK: API'den çekme listesine ekle
        if (dbCached && !isDataValid) {
           console.warn(`BAYAT CLUSTER CACHE: ${id}. (DB: ${dbCached.data.lastUpdated}, Olması gereken: ${trueLastUpdated})`);
        } else {
           console.log(`❌ Cluster Cache boş: ${id}`);
        }
        toFetch.push(id);
      }
    } catch (err) {
      console.log(`❌ Cluster Cache read hatası: ${id} -`, err.message);
      toFetch.push(id);
    }
  }
  // --- KONTROL DÖNGÜSÜ BİTTİ ---


  // --- VERİ ÇEKME VE KAYDETME (Bu kısım aynı, değişiklik yok) ---
  
  // Eksikleri API'den çek
  if (toFetch.length > 0 && isOnline()) {
    try {
      const response = await fetch(`${API_BASE}/locations/cluster-details?ids=${toFetch.join(',')}`);
      const freshData = await response.json();

      // Yeni verileri cache'e yaz
      for (let item of freshData) {
        cached[item.id] = item; // 'cached' objesine yeni gelenleri de ekle
        await saveToIndexedDB('markerDetails', {
          id: item.id,
          data: item, // 'data'nın içinde taze 'lastUpdated' da var
          timestamp: Date.now() // O "uzun rakam" (belki ileride lazım olur)
        });
      }
      
      console.log(`✅ ${toFetch.length} marker detayı API'den indirildi`);
      
      // Cluster detaylarını göster (Hem taze olanlar hem cache'den gelenler)
      showClusterDetails(Object.values(cached));
      
    } catch (err) {
      console.error('Cluster detayları indirilemedi:', err);
      if (Object.keys(cached).length === 0) {
        showNotification('⚠️ Veri indirilemedi', 'error');
        return;
      }
      // Kısmi veri bile varsa (sadece cache'dekiler) göster
      showClusterDetails(Object.values(cached));
    }
  } 
  // Sadece çevrimdışı ve bazıları cache'deyse...
  else if (toFetch.length > 0 && !isOnline()) {
    if (Object.keys(cached).length === 0) {
      showNotification('📡 İnternet bağlantısı yok ve cache boş', 'error');
      return;
    }
    showNotification('📡 Çevrimdışı mod. Sadece cache\'deki eski veriler gösteriliyor', 'warning');
    showClusterDetails(Object.values(cached));
  } 
  // Tüm veriler zaten cache'de taze olarak bulunduysa...
  else if (toFetch.length === 0 && Object.keys(cached).length > 0) {
    console.log('✅ Cluster\'daki tüm veriler cache\'de taze olarak bulundu.');
    showClusterDetails(Object.values(cached));
  }
}




/**
 * Cluster detaylarını sidebar'da göster
 */
function showClusterDetails(locations) {
  const listEl = document.getElementById('locationList');

  if (locations.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Veri bulunamadı</div>';
    return;
  }

  // Marker'ların opacity'sini güncelle ve index item'larını işaretle
  locations.forEach(loc => {
    if (window.markerMap[loc.id]) { // DÜZELTİLDİ
      window.markerMap[loc.id].setOpacity(1.0); // DÜZELTİLDİ
    }
    const indexItem = window.geoIndexData.find(item => item.id === loc.id); // DÜZELTİLDİ
    if (indexItem) {
      indexItem.isCached = true;
    }
  });

  listEl.innerHTML = locations.map(loc => {
    const title = (loc.translations && loc.translations[window.currentLang] && loc.translations[window.currentLang].title) // DÜZELTİLDİ
      ? loc.translations[window.currentLang].title // DÜZELTİLDİ
      : loc.id;
    const categoryName = window.allCategories[loc.categoryKey] || loc.categoryKey || '-'; // DÜZELTİLDİ

    // Cache'de veri varsa beyaz, yoksa pembe
    const bgColor = '#ffffff';

    return `
      <div class="location-item ${loc.id === window.selectedLocationId ? 'active' : ''}" 
           data-location-id="${loc.id}" 
           onclick="window.handleMarkerClick('${loc.id}')"
           style="background-color: ${bgColor};">
        <div class="location-title">${title}</div>
        <div class="location-meta">${loc.city} • ${categoryName}</div>
      </div>
    `; // DÜZELTİLDİ (selectedLocationId ve handleMarkerClick)
  }).join('');
}

/**
 * Tüm geoIndexData için cache durumunu kontrol et (bir kere)
 */
async function checkCacheForAllLocations() {
  for (let loc of window.geoIndexData) { // DÜZELTİLDİ
    try {
      const cached = await getFromIndexedDB('markerDetails', loc.id);
      loc.isCached = cached && cached.timestamp && isCacheValid(cached.timestamp, DETAIL_CACHE_TIME);
    } catch (err) {
      loc.isCached = false;
    }
  }
  console.log('✅ Tüm lokasyonların cache durumu kontrol edildi');
}

async function loadGeoIndex() {
  const now = Date.now();

  // Memory cache ve 5 dakika kontrolü
  if (window.geoIndexData.length > 0 && (now - window.lastIndexFetch) < INDEX_CACHE_TIME) { // DÜZELTİLDİ
    console.log('✅ Geo-Index memory cache kullanılıyor.');
    await checkCacheForAllLocations();  // ← BURASI YENİ
    await updateMapMarkers();
    updateLocationList();
    return;
  }

  console.log("📥 Yeni Geo-Index çekiliyor...");

  try {
    const response = await fetch(`${API_BASE}/locations/index`);
    window.geoIndexData = await response.json(); // DÜZELTİLDİ
    window.lastIndexFetch = now; // DÜZELTİLDİ

    // IndexedDB'ye de kaydet (1 gün geçerliliği ile)
    await saveToIndexedDB('geoIndex', {
      cacheKey: 'currentIndex',
      data: window.geoIndexData, // DÜZELTİLDİ
      timestamp: Date.now()
    });

    console.log(`✅ ${window.geoIndexData.length} marker çekildi`); // DÜZELTİLDİ
    await checkCacheForAllLocations();  // ← BURASI YENİ
    await updateMapMarkers();
    updateLocationList();
  } catch (err) {
    console.error('Geo-Index çekilemedi:', err);

    // Offline fallback: IndexedDB'den eski indexi al
    try {
      const cached = await getFromIndexedDB('geoIndex', 'currentIndex');
      if (cached) {
        window.geoIndexData = cached.data; // DÜZELTİLDİ
        showNotification('⚠️ Eski veriler gösteriliyor (çevrimdışı)', 'warning');
        await checkCacheForAllLocations();  // ← BURASI YENİ
        await updateMapMarkers();
        updateLocationList();
        return;
      }
    } catch (dbErr) {
      console.error('IndexedDB fallback hatası:', dbErr);
    }

    document.getElementById('locationList').innerHTML = '<div class="empty-state">Hata: Konum verileri yüklenemedi</div>';
  }
}

window.loadCategories = async function() {
    try {
    const res = await fetch(`${API_BASE}/categories`);
    const categories = await res.json();
    const select = document.getElementById('categoryFilter');

    select.innerHTML = '<option value="">Tüm Kategoriler</option>';
    window.allCategories = {}; // DÜZELTİLDİ

    categories.forEach(cat => {
      const opt = document.createElement('option');
      const translatedName = cat.translations[window.currentLang] || cat.key; // DÜZELTİLDİ
      opt.value = cat.key;
      opt.textContent = translatedName;
      select.appendChild(opt);
      window.allCategories[cat.key] = translatedName; // DÜZELTİLDİ
    });
  } catch (err) {
    console.error('Kategoriler yüklenemedi:', err);
  }
}

async function loadCities() {
  try {
    const res = await fetch(`${API_BASE}/meta/cities`);
    window.allCities = await res.json(); // DÜZELTİLDİ
    const select = document.getElementById('cityFilter');
    window.allCities.forEach(city => { // DÜZELTİLDİ
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city.charAt(0).toUpperCase() + city.slice(1);
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Şehirler yüklenemedi:', err);
  }
}

// --- THROTTLE FONKSIYONU (Harita kaydırma performansı) ---
function throttle(func, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func(...args);
    }
  };
}

// --- HARITA VE LİSTE GÜNCELLEME ---

/**
 * Marker'ları güncelle (cache durumu zaten geoIndexData'da var)
 */
async function updateMapMarkers() {
  window.markerClusterGroup.clearLayers(); // DÜZELTİLDİ
  Object.keys(window.markerMap).forEach(key => delete window.markerMap[key]); // DÜZELTİLDİ

  const selectedCategory = document.getElementById('categoryFilter').value;
  const selectedCity = document.getElementById('cityFilter').value;
  const search = document.getElementById('searchInput').value.toLowerCase();

  const displayLocations = window.geoIndexData.filter(loc => { // DÜZELTİLDİ
    const title = (loc.translations && loc.translations[window.currentLang] && loc.translations[window.currentLang].title) // DÜZELTİLDİ
      ? loc.translations[window.currentLang].title // DÜZELTİLDİ
      : (loc.id || '');

    const matchesSearch = title.toLowerCase().includes(search);
    const matchesCategory = !selectedCategory || loc.categoryKey === selectedCategory;
    const matchesCity = !selectedCity || loc.city === selectedCity;
    return matchesSearch && matchesCategory && matchesCity;
  });

  for (let loc of displayLocations) {
    const lat = loc.lat, lng = loc.lng;
    if (!lat || !lng) continue;

    const isSelected = loc.id === window.selectedLocationId; // DÜZELTİLDİ

    // Cache durumuna göre opacity belirle (zaten kontrol edilmiş)
    let markerOpacity = loc.isCached ? 1.0 : 0.5;

    const marker = L.marker([lat, lng], {
      icon: isSelected ? customIconSelected : customIcon,
      locationId: loc.id,
      opacity: markerOpacity
    });

    marker.on('click', () => window.handleMarkerClick(loc.id)); // DÜZELTİLDİ
    window.markerMap[loc.id] = marker; // DÜZELTİLDİ
    window.markerClusterGroup.addLayer(marker); // DÜZELTİLDİ
  }
}

/**
 * Liste güncelle
 */
async function updateLocationList() {
  const listEl = document.getElementById('locationList');
  const search = document.getElementById('searchInput').value.toLowerCase();
  const selectedCategory = document.getElementById('categoryFilter').value;
  const selectedCity = document.getElementById('cityFilter').value;

  const currentZoom = window.map.getZoom(); // DÜZELTİLDİ
  if (currentZoom < MIN_ZOOM_TO_SHOW_LIST) {
    listEl.innerHTML = '<div class="empty-state">Lokasyonları listelemek için<br>haritaya yakınlaşın...</div>';
    return;
  }

  const bounds = window.map.getBounds(); // DÜZELTİLDİ

  let filtered = window.geoIndexData.filter(loc => { // DÜZELTİLDİ
    const title = (loc.translations && loc.translations[window.currentLang] && loc.translations[window.currentLang].title) // DÜZELTİLDİ
      ? loc.translations[window.currentLang].title // DÜZELTİLDİ
      : (loc.id || '');
    const matchesSearch = title.toLowerCase().includes(search);
    const matchesCategory = !selectedCategory || loc.categoryKey === selectedCategory;
    const matchesCity = !selectedCity || loc.city === selectedCity;

    if (!matchesSearch || !matchesCategory || !matchesCity) {
      return false;
    }

    if (!loc.lat || !loc.lng) return false;
    const markerLatLng = L.latLng(loc.lat, loc.lng);
    const matchesBounds = bounds.contains(markerLatLng);

    return matchesBounds;
  });

  const MAX_LIST_ITEMS = 100;
  let hasMoreItems = false;
  if (filtered.length > MAX_LIST_ITEMS) {
    filtered = filtered.slice(0, MAX_LIST_ITEMS);
    hasMoreItems = true;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Bu alanda sonuç bulunamadı</div>';
    return;
  }

  listEl.innerHTML = filtered.map(loc => {
    const categoryName = window.allCategories[loc.categoryKey] || loc.categoryKey || '-'; // DÜZELTİLDİ
    const title = (loc.translations && loc.translations[window.currentLang] && loc.translations[window.currentLang].title) // DÜZELTİLDİ
      ? loc.translations[window.currentLang].title // DÜZELTİLDİ
      : loc.id;

    // Cache'de veri varsa beyaz, yoksa pembe background
    const bgColor = loc.isCached ? '#ffffff' : '#ffe0e6';

    return `
      <div class="location-item ${loc.id === window.selectedLocationId ? 'active' : ''}" 
           data-location-id="${loc.id}" 
           onclick="window.handleMarkerClick('${loc.id}')"
           style="background-color: ${bgColor};">
        <div class="location-title">${title}</div>
        <div class="location-meta">${loc.city} • ${categoryName}</div>
      </div>
    `}).join(''); // DÜZELTİLDİ (selectedLocationId ve handleMarkerClick)

  if (hasMoreItems) {
    listEl.innerHTML += '<div class="empty-state">(Liste, performans için ilk 100 sonuçla sınırlandırıldı...)</div>';
  }
}

// --- DETAY VE ETKİLEŞİM ---

/**
 * Marker veya liste öğesine tıklandığında detay çek
 */

// DOSYA: map_script.js
// FONKSİYON: window.handleMarkerClick

window.handleMarkerClick = async function (id) {
  if (!id) return;

  document.getElementById('detailsPanel').classList.add('active');
  document.getElementById('detailsTitle').textContent = "Yükleniyor...";
  document.getElementById('detailsDesc').textContent = "...";

  // Önceki seçileni temizle
  if (window.selectedLocationId && window.markerMap[window.selectedLocationId]) {
    window.markerMap[window.selectedLocationId].setIcon(customIcon);
  }
  document.querySelectorAll('.location-item.active').forEach(el => el.classList.remove('active'));

  window.selectedLocationId = id;

  // Yeni olanı seç (ikon ve liste)
  if (window.markerMap[id]) {
    window.markerMap[id].setIcon(customIconSelected);
  }
  const listItem = document.querySelector(`[data-location-id="${id}"]`);
  if (listItem) listItem.classList.add('active');

  // --- İŞTE DEĞİŞİKLİK BURADA (2.A) ---

  // 1. Tıklanan pinin "hafif" ama GÜNCEL olan verisini bul
  const indexItem = window.geoIndexData.find(loc => loc.id === id);
  if (!indexItem) {
    console.error(`GeoIndex'te ${id} bulunamadı!`);
    return; 
  }
  
  // 2. O verinin "gerçek" zaman damgasını al (Adım 1'de eklediğimiz)
  const trueLastUpdated = indexItem.lastUpdated; 

  // 3. "Ağır" veriyi isterken, bu "gerçek" zaman damgasını ona kanıt olarak göster
  let locationDetails = await window.getLocationDetails(id, trueLastUpdated); 

  // --- DEĞİŞİKLİK BİTTİ ---

  if (!locationDetails) {
    document.getElementById('detailsTitle').textContent = "Hata oluştu";
    return;
  }

  window.currentHeavyLocation = locationDetails;

  // Cache durumunu GÜNCEL (indexItem) veriye göre güncelle
  if (window.markerMap[id]) {
    window.markerMap[id].setOpacity(1.0);
  }
  if (indexItem) {
    indexItem.isCached = true;
  }

  // ODAKLANMA: Haritadaki GÜNCEL konumu (indexItem) kullan
  window.focusMapOnLocation(indexItem);

  // DETAY GÖSTERME: Cache'den veya API'den gelen doğrulanmış veriyi (locationDetails) kullan
  window.showDetails(locationDetails);
}




// DOSYA: map_script.js
// FONKSİYON: window.getLocationDetails (NİHAİ, AKILLI VERSİYON)

window.getLocationDetails = async function(id, trueLastUpdated) { // (Argümanlar doğru)
  
  // (Memory cache'i de bu mantıkla güncelleyeceğiz)
  if (window.detailCache.has(id)) {
     const cached = window.detailCache.get(id);
     // AKILLI KONTROL (Memory)
     if (cached.data.lastUpdated === trueLastUpdated) {
       console.log(`✅ Memory cache'den (Veri Doğrulandı): ${id}`);
       return cached.data;
     }
  }

  // IndexedDB kontrol
  try {
    const dbCached = await getFromIndexedDB('markerDetails', id); // Cache'i çektik

    // --- "SENİN MANTIĞIN" BURADA (1 HAFTA KURALI KALDIRILDI) ---
    
    // "Akıllı" Kural: Cache'deki verinin zamanı, olması gereken zamanla eşleşiyor mu?
    const isDataValid = dbCached && dbCached.data.lastUpdated === trueLastUpdated;

    if (isDataValid) { 
      // "Süreye bakmadım bile. Veri taze."
      console.log(`✅ IndexedDB cache'den (Veri Doğrulandı): ${id}`);
      
      // Memory cache'i de bu taze veriyle besle
      window.detailCache.set(id, { data: dbCached.data, timestamp: dbCached.timestamp }); 
      return dbCached.data;
    }
    
    // "Aptal" Kural (isTimeValid) buradan TAMAMEN KALDIRILDI.
    
    // Eğer 'dbCached' varsa ama 'isDataValid' değilse, loglayalım
    if (dbCached && !isDataValid) {
       console.warn(`BAYAT CACHE TESPİT EDİLDİ (Kalıcı Çözüm): ${id}.`);
       console.warn(` -> Cache'deki Zaman: ${dbCached.data.lastUpdated}`);
       console.warn(` -> Olması Gereken: ${trueLastUpdated}`);
    }
    // --- MANTIK BİTTİ ---

  } catch (err) {
    console.error('IndexedDB okuma hatası:', err);
  }

  // --- CACHE GEÇERSİZSE (BAYATSA) VEYA HİÇ YOKSA API'DEN ÇEK ---
  if (isOnline()) {
    try {
      console.log(`🔄 API'den çekiliyor (Veri bayat veya yok): ${id}`);
      const response = await fetch(`${API_BASE}/locations/details/${id}`);
      const locationDetails = await response.json();
      
      // Memory ve IndexedDB'ye kaydet (Artık taze veri elimizde)
      const cacheEntry = { data: locationDetails, timestamp: Date.now() }; // 'timestamp'i hâlâ tutuyoruz, belki ilerde 'en son ne zaman kullandık' diye gerekir.
      window.detailCache.set(id, cacheEntry);
      
      try {
        await saveToIndexedDB('markerDetails', {
          id: id,
          data: locationDetails, 
          timestamp: Date.now()
        });
      } catch (dbErr) {
        console.warn('IndexedDB save hatası:', dbErr);
      }
      
      return locationDetails;
    } catch (err) {
       console.error('API çekme hatası:', err);
       
       // API fail ama cache varsa (en son çare, bayat da olsa göster)
       const fallback = await getFromIndexedDB('markerDetails', id);
       if (fallback) {
         showNotification('⚠️ API hatası, cache\'deki eski veri gösteriliyor', 'warning');
         return fallback.data;
       }
       return null;
    }
  }
  
  // Offline ve cache yok
  showNotification('📡 İnternet yok ve cache boş', 'error');
  return null;
}






window.focusMapOnLocation = function (loc) {
  let lat, lng;
  if (loc.lat && loc.lng) { [lat, lng] = [loc.lat, loc.lng]; }
  else if (loc.location?.coordinates) { [lng, lat] = loc.location.coordinates; }
  else { return; }

  const MIN_FOCUSED_ZOOM = 17;
  const currentZoom = window.map.getZoom(); // DÜZELTİLDİ
  const targetZoom = Math.max(currentZoom, MIN_FOCUSED_ZOOM);

  window.map.flyTo([lat, lng], targetZoom, { duration: 1 }); // DÜZELTİLDİ
}

window.showDetails = function (loc) {
  const title = loc.translations[window.currentLang]?.title || loc.id; // DÜZELTİLDİ
  const description = loc.translations[window.currentLang]?.description || "Açıklama mevcut değil."; // DÜZELTİLDİ
  const audioPath = loc.translations[window.currentLang]?.audioPath; // DÜZELTİLDİ

  document.getElementById('detailsTitle').textContent = title;
  document.getElementById('detailsDesc').textContent = description;

  const categoryName = window.allCategories[loc.categoryKey] || loc.categoryKey || '-'; // DÜZELTİLDİ
  document.getElementById('detailsCity').textContent = `${loc.city}`;
  document.getElementById('detailsCategory').textContent = `${categoryName}`;
  document.getElementById('detailsBuiltYear').textContent = loc.builtYear || '-';

  const tagsDiv = document.getElementById('detailsTags');
  if (loc.tagKeys && loc.tagKeys.length > 0) {
    tagsDiv.innerHTML = loc.tagKeys.map(tagKey =>
      `<span style="background: #e3f2ff; color: #0099ff; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${tagKey}</span>`
    ).join('');
  } else {
    tagsDiv.innerHTML = '<span style="color: #999; font-size: 13px;">Etiket yok</span>';
  }

  // ... (tagsDiv... kodlarından sonra)

  const thumbnailImage = document.getElementById('thumbnailImage');
  const galleryPlaceholderContent = document.getElementById('galleryPlaceholderContent');

  // --- 1. YOL (Öncelikli): Gerçek Thumbnail
  let primaryPath = null;
  if (loc.thumbnailUrl) {
    if (loc.thumbnailUrl.startsWith('/')) { primaryPath = loc.thumbnailUrl; }
    else if (loc.thumbnailUrl.startsWith('assets/')) { primaryPath = `/${loc.thumbnailUrl}`; }
    else { primaryPath = `/assets/images/${loc.thumbnailUrl}`; } // (Bu /assets/images/ yolu hâlâ "Bavul Analojesi" sorunumuz olabilir, public/assets/images/ olmalı)
  }

  // --- 2. YOL (Şehir Varsayılanı): Senin İsteğin
  // Şehir adını al, küçük harfe çevir ve .jpg ekle (örn: "vienna" -> "vienna.jpg")
  const cityFallbackPath = loc.city ? `/fallbacks/${loc.city.toLowerCase()}.jpg` : null;

  // --- 3. YOL (Genel Varsayılan): Son Çare
  const genericFallbackPath = `/assets/images/demo.jpg`; // (Eğer bunu da /fallbacks/demo.jpg yaptıysan yolu düzelt)


  // --- HATA YAKALAMA ZİNCİRİ ---

  // Önceki dinleyicileri temizle
  thumbnailImage.onerror = null;
  thumbnailImage.onload = null;

  // Başarı Durumu (Resim bulunduğunda çalışır)
  thumbnailImage.onload = () => {
    galleryPlaceholderContent.style.display = 'none';
    thumbnailImage.style.display = 'block';
    thumbnailImage.onerror = null; // Başarılı, artık hata dinleme.
  };

  // Hata Durumu 3 (Son Çare)
  // Eğer şehir resmi (cityFallbackPath) de yüklenemezse, genel 'demo.jpg'yi dene
  const setGenericFallback = () => {
    console.warn(`Şehir resmi de bulunamadı. Genel varsayılan deneniyor: ${genericFallbackPath}`);
    thumbnailImage.onerror = () => {
      // Artık bu da başarısız olursa, placeholder'ı göster
      console.error("En son varsayılan (demo.jpg) bile yüklenemedi!");
      galleryPlaceholderContent.style.display = 'flex';
      thumbnailImage.style.display = 'none';
    };
    thumbnailImage.src = genericFallbackPath;
  };

  // Hata Durumu 2
  // Eğer ana resim (primaryPath) yüklenemezse, şehir resmini (cityFallbackPath) dene
  const setCityFallback = () => {
    if (cityFallbackPath) {
      console.log(`Thumbnail bulunamadı. Şehir varsayılanı deneniyor: ${cityFallbackPath}`);
      thumbnailImage.onerror = setGenericFallback; // Eğer bu da başarısız olursa, 3. adımı çağır
      thumbnailImage.src = cityFallbackPath;
    } else {
      // Şehir adı yoksa, direkt 3. adımı çağır
      setGenericFallback();
    }
  };

  // --- ZİNCİRİ BAŞLAT ---
  if (primaryPath) {
    // 1. Önce ana resmi (thumbnail) yüklemeyi dene
    thumbnailImage.onerror = setCityFallback; // Başarısız olursa 2. adımı çağır
    thumbnailImage.src = primaryPath;
  } else {
    // Ana resim hiç yoksa, direkt 2. adımla başla
    setCityFallback();
  }

  
  // ... (kodun kalanı)




  const audioSource = document.getElementById('audioSource');
  const audioPlayer = document.getElementById('audioPlayer');
  if (audioPath) {
    let fullAudioPath = audioPath.startsWith('/') || audioPath.startsWith('assets/') ? `/${audioPath}` : `/assets/audio/${audioPath}`;
    audioSource.src = fullAudioPath;
    audioPlayer.load();
    audioPlayer.style.display = 'block';
  } else {
    audioPlayer.style.display = 'none';
  }

  document.getElementById('detailsPanel').classList.add('active');
}

window.closeDetails = async function () {
  speechSynthesis.cancel();
  const ttsButton = document.getElementById('ttsButton');
  if (ttsButton) {
    ttsButton.textContent = '▶️';  // ← Play simgesine çevir
  }
  document.getElementById('detailsPanel').classList.remove('active');
  if (window.selectedLocationId && window.markerMap[window.selectedLocationId]) { // DÜZELTİLDİ
    window.markerMap[window.selectedLocationId].setIcon(customIcon); // DÜZELTİLDİ
  }
  document.querySelectorAll('.location-item.active').forEach(el => el.classList.remove('active'));
  window.selectedLocationId = null; // DÜZELTİLDİ
  window.currentHeavyLocation = null; // DÜZELTİLDİ
}

// --- OLAY DİNLEYİCİLERİ ---

window.throttledUpdateMarkers = throttle(updateMapMarkers, 1000); // 1 saniye bekleme
window.throttledUpdateList = throttle(updateLocationList, 1000);

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.currentLang = btn.dataset.lang; // DÜZELTİLDİ

    loadCategories();
    throttledUpdateMarkers();
    throttledUpdateList();

    if (window.currentHeavyLocation) { // DÜZELTİLDİ
      window.showDetails(window.currentHeavyLocation); // DÜZELTİLDİ
    }
  });
});

document.getElementById('searchInput').addEventListener('input', () => {
  throttledUpdateMarkers();
  throttledUpdateList();
});

document.getElementById('cityFilter').addEventListener('change', () => {
  throttledUpdateMarkers();
  throttledUpdateList();
});

document.getElementById('categoryFilter').addEventListener('change', () => {
  throttledUpdateMarkers();
  throttledUpdateList();
});

//map.on('moveend', updateLocationList); // 'window.map' olmalı ama zaten 148. satırda var


// --- CACHE TEMİZLEME (TEST İÇİN) ---

async function clearAllCache() {
  try {
    // Memory cache'i temizle
    window.detailCache.clear(); // DÜZELTİLDİ
    console.log('🧹 Memory cache temizlendi');

    // IndexedDB'den markerDetails sil
    const tx = window.db.transaction(['markerDetails'], 'readwrite'); // DÜZELTİLDİ
    const store = tx.objectStore('markerDetails');
    store.clear();

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('🧹 IndexedDB markerDetails temizlendi');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });

    showNotification('✅ Cache temizlendi. Sayfayı yenileyebilirsiniz.', 'info');
  } catch (err) {
    console.error('Cache temizleme hatası:', err);
    showNotification('❌ Cache temizlenemedi', 'error');
  }
}

async function clearIndexCache() {
  try {
    const tx = window.db.transaction(['geoIndex'], 'readwrite'); // DÜZELTİLDİ
    const store = tx.objectStore('geoIndex');
    store.clear();

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('🧹 Geo-Index cache temizlendi');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });

    window.geoIndexData = []; // DÜZELTİLDİ
    window.lastIndexFetch = 0; // DÜZELTİLDİ
    showNotification('✅ Index cache temizlendi. Sayfayı yenileyebilirsiniz.', 'info');
  } catch (err) {
    console.error('Index cache temizleme hatası:', err);
  }
}

// --- BAŞLANGIÇ ---

window.addEventListener('load', async () => {
  try {
    await initIndexedDB();
    console.log('✅ IndexedDB başlatıldı');
  } catch (err) {
    console.error('IndexedDB hatasası:', err);
  }

  initMap();
  loadCategories();
  loadCities();
  loadGeoIndex();

  // Test amaçlı: Console'da clearAllCache() veya clearIndexCache() yazabilirsiniz
  window.clearAllCache = clearAllCache;
  window.clearIndexCache = clearIndexCache;
  console.log('💡 Test için: clearAllCache() veya clearIndexCache() komutlarını kullanabilirsiniz');
});


// map_script.js dosyasının uygun bir yerine ekleyin

/**
 * Açıklama metnini (TTS) okumayı başlatır veya durdurur.
 */
window.toggleSpeech = function() {
  const ttsButton = document.getElementById('ttsButton');
  const textToSpeak = document.getElementById('detailsDesc').textContent;

  // --- 1. Durdurma Mantığı ---
  // Eğer zaten konuşuyorsa, durdur ve çık.
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    // (onend olayı butonu otomatik olarak '▶️' yapacak)
//<<<<<<< HEAD
//=======
    ttsButton.textContent = '▶️';  // ← EKLE: Play simgesine çevir
//>>>>>>> 422baa4 (oku dutonu düzenleme)
    return;
  }

  // --- 2. Metin veya Destek Yoksa ---
  if (!textToSpeak || !('speechSynthesis' in window)) {
    console.warn('TTS desteklenmiyor veya okunacak metin yok.');
    return;
  }

  // Önceki konuşmaları iptal et (her ihtimale karşı)
  speechSynthesis.cancel();

  // --- 3. Dil Seçimi ---
  // Bizim 'tr', 'en' gibi kodlarımızı, 'tr-TR', 'en-US' gibi standart kodlara çevirelim.
  const langMap = {
    'tr': 'tr-TR',
    'en': 'en-GB', // İngiliz aksanı
    'de': 'de-DE',
    'fr': 'fr-FR'
  };
  const targetLangCode = langMap[window.currentLang] || 'en-US'; // Bulamazsa Amerikan İngilizcesi

  // --- 4. Konuşma Cümlesini (Utterance) Oluşturma ---
  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  
  // A. Tarayıcıya "Lütfen bu dilde bir ses bul" diyelim.
  // Çoğu tarayıcı, o dil için en iyi/varsayılan sesi (örn: Yelda) otomatik seçer.
  utterance.lang = targetLangCode;
  
  // B. (İsteğe bağlı - Garantici Yöntem)
  // Tarayıcının ses listesini alıp manuel olarak da seçebiliriz.
  // const voices = speechSynthesis.getVoices();
  // utterance.voice = voices.find(v => v.lang === targetLangCode) || voices.find(v => v.lang.startsWith(window.currentLang));

  // --- 5. Buton Simgelerini Güncelleme (Başlangıç ve Bitiş) ---
  utterance.onstart = () => {
    ttsButton.textContent = '⏹️'; // Durdur simgesi
  };
  
  utterance.onend = () => {
    ttsButton.textContent = '▶️'; // Oynat simgesi
  };

  // --- 6. Konuş! ---
  speechSynthesis.speak(utterance);
}