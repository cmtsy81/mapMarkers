/**
 * map_mobile_script.js
 * Mobile-only script: Bottom panel %15 + Detay button → Fullscreen
 * + Floating controls (Layer Dropdown + Dil Dropdown + Konum Bul) + Geolocation
 */

let isMobileMode = () => {
  // Touch capability ve ekran genişliğine göre mobile mode
  return window.matchMedia("(max-width: 768px) and (hover: none) and (pointer: coarse)").matches;
};

let mobilePanel = null;
let detailsPanel = document.getElementById('detailsPanel');
let userLocationMarker = null;
let watchPositionId = null;
let trackingState = 0; // 0=Kapalı, 1=Aktif, 2=Pasif
let mapMoveListenerAttached = false; // <-- BU YENİ SATIRI EKLE
let isProgrammaticMove = false;

// ===== FLOATING CONTROLS (Layer Dropdown + Dil Dropdown + Konum Bul) =====

function createFloatingControls() {
  if (document.getElementById('floatingControls')) return;

  const container = document.createElement('div');
  container.id = 'floatingControls';
  container.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 998;
    display: flex;
    flex-direction: row;
    gap: 10px;
    align-items: flex-start;
  `;

  // ===== LAYER DROPDOWN =====
  const layerDropdownWrapper = document.createElement('div');
  layerDropdownWrapper.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
  `;

  const layerToggleBtn = document.createElement('button');
  layerToggleBtn.id = 'layerToggleBtn';
  layerToggleBtn.textContent = '🗺️';
  layerToggleBtn.style.cssText = `
    width: 40px;
    height: 40px;
    border: none;
    background: #ffffff;
    color: #0099ff;
    border-radius: 6px;
    cursor: pointer;
    font-size: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  layerToggleBtn.addEventListener('mouseover', () => {
    layerToggleBtn.style.transform = 'scale(1.05)';
    layerToggleBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  });
  layerToggleBtn.addEventListener('mouseout', () => {
    layerToggleBtn.style.transform = 'scale(1)';
    layerToggleBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
  });

  const layerPanel = document.createElement('div');
  layerPanel.id = 'layerPanel';
  layerPanel.style.cssText = `
    position: absolute;
    top: 45px;
    right: 0;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 8px;
    display: none;
    flex-direction: column;
    gap: 6px;
    min-width: 100px;
    z-index: 1000;
  `;

  const layers = [
    { name: 'Sokak', key: 'street' },
    { name: 'Uydu', key: 'satellite' }
  ];

  layers.forEach((layer, index) => {
    const btn = document.createElement('button');
    btn.textContent = layer.name;
    btn.className = index === 0 ? 'layer-opt-btn active' : 'layer-opt-btn';
    btn.dataset.layer = layer.key;
    btn.style.cssText = `
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      background: ${index === 0 ? '#0099ff' : '#f8f9fa'};
      color: ${index === 0 ? '#ffffff' : '#333'};
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: all 0.2s;
      text-align: left;
    `;
    btn.addEventListener('click', () => changeLayer(layer.key, btn, layerToggleBtn, layerPanel));
    layerPanel.appendChild(btn);
  });

  layerToggleBtn.addEventListener('click', () => {
    const isOpen = layerPanel.style.display === 'flex';
    layerPanel.style.display = isOpen ? 'none' : 'flex';
    langPanel.style.display = 'none'; // Diğer paneli kapat
  });

  layerDropdownWrapper.appendChild(layerToggleBtn);
  layerDropdownWrapper.appendChild(layerPanel);

  // ===== DİL DROPDOWN =====
  const langDropdownWrapper = document.createElement('div');
  langDropdownWrapper.style.cssText = `
    position: relative;
    display: flex;
    flex-direction: column;
  `;

  const langToggleBtn = document.createElement('button');
  langToggleBtn.id = 'langToggleBtn';
  langToggleBtn.textContent = window.currentLang.toUpperCase();
  langToggleBtn.style.cssText = `
    width: 40px;
    height: 40px;
    border: none;
    background: #0099ff;
    color: #ffffff;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 700;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0,153,255,0.3);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  langToggleBtn.addEventListener('mouseover', () => {
    langToggleBtn.style.transform = 'scale(1.05)';
    langToggleBtn.style.boxShadow = '0 4px 12px rgba(0,153,255,0.4)';
  });
  langToggleBtn.addEventListener('mouseout', () => {
    langToggleBtn.style.transform = 'scale(1)';
    langToggleBtn.style.boxShadow = '0 2px 8px rgba(0,153,255,0.3)';
  });

  const langPanel = document.createElement('div');
  langPanel.id = 'langPanel';
  langPanel.style.cssText = `
    position: absolute;
    top: 45px;
    right: 0;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    padding: 8px;
    display: none;
    flex-direction: column;
    gap: 6px;
    min-width: 80px;
    z-index: 1000;
  `;

  ['tr', 'en', 'de', 'fr'].forEach(lang => {
    const btn = document.createElement('button');
    btn.textContent = lang.toUpperCase();
    btn.className = lang === window.currentLang ? 'lang-opt-btn active' : 'lang-opt-btn';
    btn.dataset.lang = lang;
    btn.style.cssText = `
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      background: ${lang === window.currentLang ? '#0099ff' : '#f8f9fa'};
      color: ${lang === window.currentLang ? '#ffffff' : '#333'};
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      transition: all 0.2s;
      text-align: center;
    `;
    btn.addEventListener('click', () => changeMobileLanguage(lang, langToggleBtn, langPanel));
    langPanel.appendChild(btn);
  });

  langToggleBtn.addEventListener('click', () => {
    const isOpen = langPanel.style.display === 'flex';
    langPanel.style.display = isOpen ? 'none' : 'flex';
    layerPanel.style.display = 'none'; // Diğer paneli kapat
  });

  langDropdownWrapper.appendChild(langToggleBtn);
  langDropdownWrapper.appendChild(langPanel);

  // ===== KONUM BUL BUTONU =====
  const locationBtn = document.createElement('button');
  locationBtn.id = 'locationBtn';
  locationBtn.textContent = '📍';
  locationBtn.style.cssText = `
    width: 44px;
    height: 44px;
    border: none;
    background: #0099ff;
    color: #ffffff;
    border-radius: 50%;
    cursor: pointer;
    font-size: 20px;
    box-shadow: 0 2px 8px rgba(0,153,255,0.3);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  locationBtn.addEventListener('click', handleLocationButtonClick);

  locationBtn.style.opacity = '0.5';

  locationBtn.addEventListener('mouseover', () => {
    locationBtn.style.transform = 'scale(1.1)';
    locationBtn.style.boxShadow = '0 4px 12px rgba(0,153,255,0.4)';
  });
  locationBtn.addEventListener('mouseout', () => {
    locationBtn.style.transform = 'scale(1)';
    locationBtn.style.boxShadow = '0 2px 8px rgba(0,153,255,0.3)';
  });

  // ===== KONTEİNERE EKLE =====
  container.appendChild(layerDropdownWrapper);
  container.appendChild(langDropdownWrapper);
  container.appendChild(locationBtn);
  document.body.appendChild(container);

  // Dışarıya tıklanınca panelleri kapat
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#floatingControls')) {
      layerPanel.style.display = 'none';
      langPanel.style.display = 'none';
    }
  });
}

// Layer değiştir
function changeLayer(layerKey, btn, toggleBtn, panel) {
  // Buton stilini güncelle
  document.querySelectorAll('#layerPanel .layer-opt-btn').forEach(b => {
    b.style.background = '#f8f9fa';
    b.style.color = '#333';
  });
  btn.style.background = '#0099ff';
  btn.style.color = '#ffffff';

  // Leaflet layer control'deki butonlara da tıkla (senkronizasyon)
  const leafletBtns = document.querySelectorAll('.leaflet-control-layers-selector');
  if (leafletBtns.length > 0) {
    leafletBtns.forEach(lb => {
      if (layerKey === 'street' && lb.nextSibling.textContent.includes('Sokak')) {
        if (!lb.checked) lb.click();
      } else if (layerKey === 'satellite' && lb.nextSibling.textContent.includes('Uydu')) {
        if (!lb.checked) lb.click();
      }
    });
  }

  // Paneli kapat
  panel.style.display = 'none';
}

// Dil değiştir (mobile)
function changeMobileLanguage(lang, toggleBtn, panel) {
  window.currentLang = lang;

  // Toggle butonunu güncelle
  toggleBtn.textContent = lang.toUpperCase();

  // Dil butonlarını güncelle
  document.querySelectorAll('#langPanel .lang-opt-btn').forEach(btn => {
    if (btn.dataset.lang === lang) {
      btn.style.background = '#0099ff';
      btn.style.color = '#ffffff';
      btn.classList.add('active');
    } else {
      btn.style.background = '#f8f9fa';
      btn.style.color = '#333';
      btn.classList.remove('active');
    }
  });

  window.loadCategories();
  window.throttledUpdateMarkers();
  window.throttledUpdateList();

  if (window.currentHeavyLocation) {
    window.showDetails(window.currentHeavyLocation);
  }

  if (window.selectedLocationId && mobilePanel && mobilePanel.style.display === 'flex') {
    const location = window.geoIndexData.find(loc => loc.id === window.selectedLocationId);
    if (location) {
      const title = location.translations?.[window.currentLang]?.title || location.id;
      const categoryName = window.allCategories[location.categoryKey] || '-';
      document.getElementById('mobileTitle').textContent = title;
      document.getElementById('mobileCategory').textContent = `${location.city} • ${categoryName}`;
    }
  }

  // Paneli kapat
  panel.style.display = 'none';
}

// ===== GEOLOCATION =====

/**
 * Durum Makinesi:
 * 0 (Kapalı)     → Tıkla → 1 (Aktif Takip)
 * 1 (Aktif Takip) → Harita oynat → 2 (Pasif)
 *                 → Tıkla → 0 (Kapalı)
 * 2 (Pasif)      → Tıkla → 1 (Aktif Takip)
 */

function handleLocationButtonClick() {
  if (trackingState === 0) {
    // Kapalı → Aktif Takip
    startActiveTracking();
  } else if (trackingState === 1) {
    // Aktif Takip → Kapalı
    stopAllTracking();
  } else if (trackingState === 2) {
    // Pasif → Aktif Takip (tekrar başla)
    startActiveTracking();
  }
}

function startActiveTracking() {

  // --- YARIŞ DURUMU DÜZELTMESİ ---
  // Harita dinleyicisini, 'window.map'in yüklendiğinden emin olduğumuz
  // bu ilk tıklama anında, sadece bir kez ekliyoruz.
  if (!mapMoveListenerAttached) {
    attachMapMoveListener(); 
  }
  // --- DÜZELTME BİTTİ ---

  if (!navigator.geolocation) {
    showNotification('Geolocation desteklenmiyor', 'error');
    return;
  }

  trackingState = 1;
  const btn = document.getElementById('locationBtn');
  btn.style.opacity = '1';
  btn.style.pointerEvents = 'none';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      
      // 1. Konumu bul
      showUserMarker(latitude, longitude);
      
      // 2. Beni ortaya al
      centerMapOnUserLocation(latitude, longitude);
      
      // 3. Zoom sabitle (16)
      map.setZoom(16);
      
      // 4. Sürekli güncelle
      startLocationTracking();
      
      btn.style.pointerEvents = 'auto';
      showNotification('✅ Konumunuz bulundu - Aktif Takip', 'info');
    },
    (error) => {
      console.error('Geolocation error:', error);
      showNotification('❌ Konum alınamadı: ' + error.message, 'error');
      trackingState = 0;
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'auto';
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function startLocationTracking() {
  if (watchPositionId) {
    navigator.geolocation.clearWatch(watchPositionId);
  }

  watchPositionId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      
      // Marker'ı güncelle
      showUserMarker(latitude, longitude);
      
      // Harita takibedeyse (Pasif değilse) merkezi güncelle
      if (trackingState === 1) {
        centerMapOnUserLocation(latitude, longitude);
      }
    },
    (error) => {
      console.error('Tracking error:', error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function stopAllTracking() {
  // Kapalı yap
  trackingState = 0;
  const btn = document.getElementById('locationBtn');
  btn.style.opacity = '0.5';
  
  // Watch'i kapat
  if (watchPositionId) {
    navigator.geolocation.clearWatch(watchPositionId);
    watchPositionId = null;
  }
  
  // Marker'ı kaldır
  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
    userLocationMarker = null;
  }
  
  console.log('❌ Konum takibi kapalı');
  showNotification('❌ Takip Kapatıldı', 'info');
}



// DOSYA: map_mobile_script.js
// stopAllTracking() FONKSİYONUNDAN SONRA BUNU EKLE

/**
 * Haritaya "Kullanıcı Hareketi" dinleyicisini ekler.
 * Bu, 'move' yerine 'movestart' kullanır (senin önerin),
 * böylece KULLANICININ ilk hareketi (pan/zoom) algılanır
 * ve kodun kendi 'centerMap' hareketiyle çakışmaz ("Dost Ateşi"ni önler).
 */
// DOSYA: map_mobile_script.js
// attachMapMoveListener FONKSİYONUNUN TAMAMINI BUNUNLA DEĞİŞTİR:

function attachMapMoveListener() {
  if (!window.map) {
    console.error("Hata: 'map' nesnesi bulunamadı, hareket dinleyicisi eklenemedi.");
    setTimeout(attachMapMoveListener, 500); // 500ms sonra tekrar dene
    return;
  }
  
  // 'movestart' (KULLANICI hareketi) dinleyicisi
  window.map.on('movestart', () => {
    
    // --- GÜVENLİK KONTROLÜ (Hata 1 Düzeltmesi) ---
    // Eğer bayrak kalkmışsa (yani bu hareketi 'centerMap' kodumuz başlattıysa)
    if (isProgrammaticMove) {
      return; // Hiçbir şey yapma, bu "Dost Ateşi"ydi.
    }
    // --- KONTROL BİTTİ ---

    // Bu, KULLANICI tarafından başlatılan gerçek bir harekettir.
    // Sadece "Aktif Takip" (State 1) modundaysak...
    if (trackingState === 1 && isMobileMode()) {
      trackingState = 2; // Durumu "Pasif" (State 2) yap
      const btn = document.getElementById('locationBtn');
      if (btn) btn.style.opacity = '0.6'; // Buton rengini pasif yap
      
      // --- YAZIM HATASI DÜZELTMESİ (Hata 2 Düzeltmesi) ---
      // (Dış tırnakları çift tırnak (") yaparak 'movestart' çakışması düzeltildi)
      console.log("📍 Harita KULLANICI tarafından oynatıldı - Pasif Moda Geçildi ('movestart')");
      // --- DÜZELTME BİTTİ ---
      
      if (typeof showNotification === 'function') {
        showNotification('📍 Pasif Moda Geçildi (Tekrar Tıkla)', 'info');
      }
    }
  });

  // YENİ DİNLEYİCİ: "Bayrağı İndirme"
  // Kodumuzun başlattığı hareket (setView) bittiğinde, bayrağı indirmeliyiz.
  window.map.on('moveend', () => {
    if (isProgrammaticMove) {
      isProgrammaticMove = false; // BAYRAĞI İNDİR: "Benim (kod) işim bitti."
    }
  });

  mapMoveListenerAttached = true; // Bayrağı "eklendi" olarak ayarla
  console.log("✅ Mobil 'movestart' ve 'moveend' dinleyicileri başarıyla eklendi.");
}


function centerMapOnUserLocation(lat, lng) {
  isProgrammaticMove = true; // BAYRAĞI KALDIR: "Dikkat, bu hareketi ben (kod) yapıyorum!"
  map.setView([lat, lng], 16);
}

function showUserMarker(lat, lng) {
  if (userLocationMarker) {
    userLocationMarker.setLatLng([lat, lng]);
  } else {
    userLocationMarker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxNiIgZmlsbD0iIzAwOTlmZiIgb3BhY2l0eT0iMC4zIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iOCIgZmlsbD0iIzAwOTlmZiIvPjwvc3ZnPg==',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
      })
    }).addTo(map);
  }
}

// ===== MOBILE PANEL =====

function createMobilePanel() {
  if (document.getElementById('mobilePanelWrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'mobilePanelWrapper';
  wrapper.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 15vh;
    background: #ffffff;
    border-top: 1px solid #e8e8e8;
    z-index: 1010;
    display: none;
    flex-direction: column;
    padding: 12px;
    overflow-y: auto;
    box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
    animation: slideUp 0.3s ease;
  `;

  wrapper.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
      <div style="flex: 1;">
        <h3 id="mobileTitle" style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">-</h3>
        <p id="mobileCategory" style="margin: 0; font-size: 12px; color: #999;">-</p>
      </div>
      <button id="detailBtn" style="
        padding: 8px 16px;
        background: #0099ff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        white-space: nowrap;
        flex-shrink: 0;
      ">Detay</button>
      <button id="closeMobileBtn" style="
        background: none;
        border: none;
        color: #ddd;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        flex-shrink: 0;
      ">✕</button>
    </div>
  `;

  document.body.appendChild(wrapper);
  mobilePanel = wrapper;

  document.getElementById('detailBtn').addEventListener('click', openFullscreen);
  document.getElementById('closeMobileBtn').addEventListener('click', closeMobilePanel);
}

function openMobilePanel(locationId) {
  if (!isMobileMode()) return;

  createMobilePanel();

  const location = geoIndexData.find(loc => loc.id === locationId);
  if (!location) return;

  const title = location.translations?.[currentLang]?.title || location.id;
  const categoryName = allCategories[location.categoryKey] || '-';

  document.getElementById('mobileTitle').textContent = title;
  document.getElementById('mobileCategory').textContent = `${location.city} • ${categoryName}`;

  mobilePanel.style.display = 'flex';
}

async function openFullscreen() {
  if (!selectedLocationId) return;

  detailsPanel.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100vh !important;
    max-height: 100vh !important;
    z-index: 2000 !important;
    border: none !important;
    padding: 16px !important;
    display: block !important;
    overflow-y: auto !important;
    background: #ffffff !important;
    animation: slideUp 0.3s ease !important;
  `;

  if (mobilePanel) mobilePanel.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'fullscreenOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    z-index: 1999;
    display: none;
  `;
  document.body.appendChild(overlay);
}

function closeMobilePanel() {
  if (mobilePanel) {
    mobilePanel.style.display = 'none';
  }
  selectedLocationId = null;
  currentHeavyLocation = null;
}

function closeFullscreenPanel() {
  if (!isMobileMode()) {
    closeDetails();
    return;
  }

  detailsPanel.style.cssText = '';
  detailsPanel.classList.remove('active');

  const overlay = document.getElementById('fullscreenOverlay');
  if (overlay) overlay.remove();

  if (mobilePanel && selectedLocationId) {
    openMobilePanel(selectedLocationId);
  } else {
    closeMobilePanel();
  }
}

function mapClickListener(e) {
  if (!isMobileMode()) return;

  if (e.target.closest('#mobilePanelWrapper') ||
      e.target.closest('#detailsPanel') ||
      e.target.closest('.details-panel')) {
    return;
  }

  closeMobilePanel();
  closeFullscreenPanel();
}

const originalHandleMarkerClick = window.handleMarkerClick;

window.handleMarkerClick = async function(id) {
  if (!isMobileMode()) {
    originalHandleMarkerClick(id);
    return;
  }

  window.selectedLocationId = id;

  const indexItem = window.geoIndexData.find(loc => loc.id === id);
  if (!indexItem) {
    console.error(`(Mobil) GeoIndex'te ${id} bulunamadı!`);
    return;
  }

  const trueLastUpdated = indexItem.lastUpdated;
  let locationDetails = await window.getLocationDetails(id, trueLastUpdated);

  if (!locationDetails) return;

  window.currentHeavyLocation = locationDetails;

  window.focusMapOnLocation(indexItem);
  window.showDetails(locationDetails);

  detailsPanel.classList.add('active');
  detailsPanel.style.display = 'none';

  openMobilePanel(id);
};

window.addEventListener('resize', () => {
  const wasOnMobile = mobilePanel?.style.display === 'flex';

  if (!isMobileMode() && wasOnMobile) {
    if (mobilePanel) mobilePanel.style.display = 'none';
    detailsPanel.style.cssText = '';
    detailsPanel.classList.add('active');
  } else if (isMobileMode() && !wasOnMobile && selectedLocationId) {
    detailsPanel.style.display = 'none';
    openMobilePanel(selectedLocationId);
  }
});

const closeBtn = document.querySelector('.close-btn');
if (closeBtn) {
  closeBtn.addEventListener('click', closeFullscreenPanel);
}

document.getElementById('map').addEventListener('click', mapClickListener);

// ===== INITIALIZATION =====

window.addEventListener('load', () => {
  if (isMobileMode()) {
    createFloatingControls();
  }

  // Harita pan/zoom olaylarını dinle ve takipi pasife geç
  
});

window.addEventListener('resize', () => {
  if (isMobileMode() && !document.getElementById('floatingControls')) {
    createFloatingControls();
  } else if (!isMobileMode() && document.getElementById('floatingControls')) {
    document.getElementById('floatingControls').remove();
  }
});

console.log('✅ Mobile script yüklendi (Durum Makinesi: 0=Kapalı, 1=Aktif, 2=Pasif)');