// src/paketler_main.js - TAMAMLANMIŞ VERSION

const API_BASE = "https://history-markers.onrender.com/api/v1";

let db;

// ===== INDEXEDDB BAŞLATMA =====
async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('travelAppCache', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      console.log('✅ IndexedDB açıldı');
      resolve();
    };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains('markerDetails')) {
        database.createObjectStore('markerDetails', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('mediaCache')) {
        database.createObjectStore('mediaCache');
      }
      if (!database.objectStoreNames.contains('geoIndex')) {
        database.createObjectStore('geoIndex', { keyPath: 'cacheKey' });
      }
    };
  });
}

// ===== INDEXEDDB FONKSIYONLARI =====
async function saveToIndexedDB(storeName, data) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteFromIndexedDB(storeName, key) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromIndexedDB(storeName) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ===== BILDIRIM FONKSİYONLARI =====
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showProgressNotification(message) {
  let toast = document.getElementById('progressToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'progressToast';
    toast.className = 'toast info';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.display = 'block';
}

function hideProgressNotification() {
  const toast = document.getElementById('progressToast');
  if (toast) toast.style.display = 'none';
}

// ===== PAKET YÜKLEME =====
async function loadPackages() {
  const container = document.getElementById('paket-listesi');
  
  try {
    showProgressNotification('Paketler yükleniyor...');
    
    const response = await fetch(`${API_BASE}/packages/summary`);
    if (!response.ok) throw new Error('Paket listesi çekilemedi');
    const packages = await response.json();
    
    const downloadedDetails = await getAllFromIndexedDB('markerDetails');
    const downloadedCities = new Set(downloadedDetails.map(item => item.data.city));
    
    console.log('İndirilen Şehirler:', Array.from(downloadedCities));
    
    container.innerHTML = '';
    packages.forEach(pkg => renderPackageBox(pkg, downloadedCities));
    
    hideProgressNotification();
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state">Paketler yüklenirken hata oluştu.</div>';
    hideProgressNotification();
  }
}

// ===== PAKET KUTUSU RENDER =====
function renderPackageBox(pkg, downloadedCities) {
  const container = document.getElementById('paket-listesi');
  const box = document.createElement('div');
  box.className = 'paket-kutusu';
  
  const isDownloaded = downloadedCities.has(pkg.id);
  
  const indirBtnStyle = isDownloaded ? 'style="display:none;"' : '';
  const silBtnStyle = isDownloaded ? '' : 'style="display:none;"';
  const guncelleBtnStyle = isDownloaded ? '' : 'style="display:none;"';

  box.innerHTML = `
    <h2>${pkg.name}</h2>
    <div class="paket-info">
      <span>${pkg.markerCount}</span> lokasyon
      <br>
      <span>~${pkg.sizeMB} MB</span> disk alanı
    </div>
    <div class="paket-actions">
      <button class="btn-indir" data-city-id="${pkg.id}" ${indirBtnStyle}>⬇️ İndir</button>
      <button class="btn-sil" data-city-id="${pkg.id}" ${silBtnStyle}>🗑️ Sil</button>
      <button class="btn-guncelle" data-city-id="${pkg.id}" ${guncelleBtnStyle}>🔄 Güncelle</button>
    </div>
  `;

  box.querySelector('.btn-indir').addEventListener('click', () => handleDownload(pkg.id, pkg.name));
  box.querySelector('.btn-sil').addEventListener('click', () => handleDelete(pkg.id, pkg.name));
  box.querySelector('.btn-guncelle').addEventListener('click', () => handleUpdate(pkg.id, pkg.name));

  container.appendChild(box);
}

// ===== İNDİR FONKSİYONU =====
async function handleDownload(cityId, cityName) {
  try {
    const downloadBtn = document.querySelector(`[data-city-id="${cityId}"].btn-indir`);
    downloadBtn.disabled = true;
    downloadBtn.textContent = '⏳ İndiriliyor...';

    showProgressNotification(`${cityName} indiriliyor... (0%)`);

    // 1. Paket detaylarını API'den çek
    console.log(`📦 ${cityId} paketi çekiliyor...`);
    const response = await fetch(`${API_BASE}/packages/details/${cityId}`);
    if (!response.ok) throw new Error('Paket detayları çekilemedi');
    const packageData = await response.json();

    const totalItems = packageData.details.length;
    let processedItems = 0;

    // 2. Marker detaylarını IndexedDB'ye kaydet
    console.log(`💾 ${totalItems} marker kaydediliyor...`);
    for (const marker of packageData.details) {
      await saveToIndexedDB('markerDetails', {
        id: marker.id,
        data: marker,
        timestamp: Date.now()
      });
      processedItems++;
      const progress = Math.round((processedItems / totalItems) * 100);
      showProgressNotification(`${cityName} indiriliyor... (${progress}%)`);
    }

    // 3. Medya dosyalarını indir (marker'lardan çıkart)
    const mediaFiles = new Map();
    
    // Marker'lardan thumbnail ve audio dosya adlarını topla
    for (const marker of packageData.details) {
      if (marker.thumbnailUrl) {
        mediaFiles.set(marker.thumbnailUrl, 'image');
      }
      
      // Çevirilerdeki audio dosyaları
      if (marker.translations) {
        Object.values(marker.translations).forEach(trans => {
          if (trans.audioPath) {
            mediaFiles.set(trans.audioPath, 'audio');
          }
        });
      }
    }

    if (mediaFiles.size > 0) {
      console.log(`📸 ${mediaFiles.size} medya dosyası indiriliyor...`);
      
      for (const [fileName, type] of mediaFiles) {
        try {
          // Dosya yolunu oluştur
          let mediaUrl;
          if (type === 'image') {
            mediaUrl = `https://mapmarkers.onrender.com/assets/images/${fileName}`;
          } else if (type === 'audio') {
            mediaUrl = `https://mapmarkers.onrender.com/assets/audio/${fileName}`;
          }
          
          console.log(`📥 İndiriliyor: ${mediaUrl}`);
          const mediaResponse = await fetch(mediaUrl);
          
          if (mediaResponse.ok) {
            const mediaBlob = await mediaResponse.blob();
            await saveToIndexedDB('mediaCache', {
              id: fileName,
              blob: mediaBlob,
              timestamp: Date.now()
            });
            console.log(`✅ Medya kaydedildi: ${fileName}`);
          } else {
            console.warn(`⚠️ Medya ${mediaResponse.status}: ${fileName}`);
          }
        } catch (mediaErr) {
          console.warn(`⚠️ Medya indirme hatası: ${fileName}`, mediaErr);
        }
        processedItems++;
        const progress = Math.round((processedItems / totalItems) * 100);
        showProgressNotification(`${cityName} indiriliyor... (${progress}%)`);
      }
    }

    showProgressNotification(`${cityName} başarıyla indirildi!`);
    showNotification(`✅ ${cityName} cache'e kaydedildi!`, 'success');

    // Test için sayfayı yenilemeyi devre dışı bıraktık
    // setTimeout(() => {
    //   location.reload();
    // }, 1500);

  } catch (err) {
    console.error('İndirme hatası:', err);
    showNotification(`❌ İndirme hatası: ${err.message}`, 'error');
    const downloadBtn = document.querySelector(`[data-city-id="${cityId}"].btn-indir`);
    downloadBtn.disabled = false;
    downloadBtn.textContent = '⬇️ İndir';
    hideProgressNotification();
  }
}

// ===== SİL FONKSİYONU =====
async function handleDelete(cityId, cityName) {
  if (!confirm(`${cityName} paketini tamamen silmek istediğinize emin misiniz?`)) {
    return;
  }

  try {
    const deleteBtn = document.querySelector(`[data-city-id="${cityId}"].btn-sil`);
    deleteBtn.disabled = true;
    deleteBtn.textContent = '⏳ Siliniyor...';

    showProgressNotification(`${cityName} siliniyor...`);

    // 1. Marker detaylarını sil
    console.log(`🗑️ ${cityId} markerları siliniyor...`);
    const allMarkers = await getAllFromIndexedDB('markerDetails');
    const cityMarkers = allMarkers.filter(m => m.data.city === cityId);

    for (const marker of cityMarkers) {
      await deleteFromIndexedDB('markerDetails', marker.id);
    }

    // 2. Medya dosyalarını sil
    const cityMediaNames = [];
    
    for (const marker of cityMarkers) {
      if (marker.data.thumbnailUrl) {
        cityMediaNames.push(marker.data.thumbnailUrl);
      }
      
      Object.values(marker.data.translations || {}).forEach(trans => {
        if (trans.audioPath) {
          cityMediaNames.push(trans.audioPath);
        }
      });
    }

    console.log(`📸 ${cityMediaNames.length} medya dosyası siliniyor...`);
    for (const mediaName of cityMediaNames) {
      try {
        await deleteFromIndexedDB('mediaCache', mediaName);
        console.log(`✅ Medya silindi: ${mediaName}`);
      } catch (err) {
        console.warn(`⚠️ Medya silme hatası: ${mediaName}`, err);
      }
    }

    showNotification(`✅ ${cityName} cache'den silindi!`, 'success');
    hideProgressNotification();

    // Test için sayfayı yenilemeyi devre dışı bıraktık
    // setTimeout(() => {
    //   location.reload();
    // }, 1500);

  } catch (err) {
    console.error('Silme hatası:', err);
    showNotification(`❌ Silme hatası: ${err.message}`, 'error');
    const deleteBtn = document.querySelector(`[data-city-id="${cityId}"].btn-sil`);
    deleteBtn.disabled = false;
    deleteBtn.textContent = '🗑️ Sil';
    hideProgressNotification();
  }
}

// ===== GÜNCELLE FONKSİYONU =====
async function handleUpdate(cityId, cityName) {
  console.log(`🔄 ${cityName} güncelleniyor (Sil + İndir)...`);
  await handleDelete(cityId, cityName);
}

// ===== BAŞLANGIÇ =====
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initIndexedDB();
    await loadPackages();
  } catch (err) {
    console.error('Başlama hatası:', err);
    showNotification('Başlama hatası', 'error');
  }
});