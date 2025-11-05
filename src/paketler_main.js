// src/paketler_main.js

// --- 1. AYARLAR VE API ---
// "Mutfak" API'mizin adresini tanımlıyoruz
const API_BASE = "https://history-markers.onrender.com/api/v1";

// --- 2. INDEXEDDB YARDIMCI KODLARI ---
// (Bu kodlar, 'map_script.js' içindekilerin aynısıdır.
// İlerde bunları 'src/db.js' gibi tek bir dosyaya taşıyabiliriz.)

let db; // Global DB bağlantısı

async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('travelAppCache', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      console.log('✅ IndexedDB (Kiler) başarıyla açıldı.');
      resolve();
    };
    // (onupgradeneeded kısmı 'map_script.js' tarafından zaten yapıldığı için
    // burada tekrar eklemeye gerek yok, varsayılan olarak çalışır.)
  });
}

async function saveToIndexedDB(storeName, data) {
  if (!db) await initIndexedDB(); // Bağlantı yoksa aç
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// (Dosyaları IndexedDB'ye BLOB olarak kaydetme fonksiyonu - EN KRİTİK YER)
async function saveMediaBlobToDB(storeName, key, blob) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(blob, key); // (key: dosya adı, value: dosya içeriği)
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}



/**
 * IndexedDB'den bir tablodaki TÜM kayıtları çeker.
 */
async function getAllFromIndexedDB(storeName) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll(); // <-- Tüm kayıtları al
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- 3. PAKET YÖNETİCİSİ MANTIĞI ---


// Sayfa yüklendiğinde bu fonksiyon çalışır
async function loadPackages() {
  const container = document.getElementById('paket-listesi');
  
  try {
    // 1. Adım: "Mutfak"tan (/packages/summary) paket listesini al
    const response = await fetch(`${API_BASE}/packages/summary`);
    if (!response.ok) throw new Error('Paket listesi çekilemedi');
    const packages = await response.json();
    
    // --- YENİ ADIM: "KİLER" (IndexedDB) KONTROLÜ ---
    // 'markerDetails' (Ağır Veri) kasamızdaki tüm mevcut kayıtları çek
    // (Dikkat: 'markerDetails' tablosunun 'map_script.js' tarafından oluşturulduğunu varsayıyoruz)
    const downloadedDetails = await getAllFromIndexedDB('markerDetails');
    
    // Bu kayıtlardan, hangi şehirlerin bizde olduğunu gösteren bir Set (liste) oluştur
    // (Aynı şehirden 100 kayıt bile olsa, Set sayesinde listede 1 kez yer alır)
    const downloadedCities = new Set(downloadedDetails.map(item => item.data.city));
    console.log('İndirilmiş (Cache\'lenmiş) Şehirler:', downloadedCities);
    // --- YENİ ADIM BİTTİ ---

    container.innerHTML = ''; // Yükleniyor spinner'ını temizle

    // 2. Adım: Her paket için bir "kutu" oluştur
    // (Artık 'downloadedCities' listesini de gönderiyoruz)
    packages.forEach(pkg => renderPackageBox(pkg, downloadedCities));

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state">Paketler yüklenirken bir hata oluştu.</div>';
  }
}


// Her bir paket (şehir) için HTML kutusunu çizer
function renderPackageBox(pkg, downloadedCities) { // <-- 1. YENİ ARGÜMANI (downloadedCities) AL
  const container = document.getElementById('paket-listesi');
  const box = document.createElement('div');
  box.className = 'paket-kutusu';
  
  // --- YENİ ADIM: "AKILLI" BUTON MANTIĞI ---
  // Bu paket (şehir), 'downloadedCities' listesinde var mı?
  const isDownloaded = downloadedCities.has(pkg.id);
  
  const indirBtnStyle = isDownloaded ? 'style="display:none;"' : '';
  const silBtnStyle = isDownloaded ? '' : 'style="display:none;"';
  // (Güncelleme mantığını şimdilik 'Sil' ile aynı tutuyoruz)
  const guncelleBtnStyle = isDownloaded ? '' : 'style="display:none;"';
  // --- YENİ ADIM BİTTİ ---

  // Kutu içeriğini oluştur (Yeni buton stilleriyle)
  box.innerHTML = `
    <h2>${pkg.name}</h2>
    <div class="paket-info">
      <span>${pkg.markerCount}</span> lokasyon
      <br>
      <span>~${pkg.sizeMB} MB</span> disk alanı
    </div>
    <div class="paket-actions">
      <button class="btn-indir" data-city-id="${pkg.id}" ${indirBtnStyle}>İndir</button>
      <button class="btn-sil" data-city-id="${pkg.id}" ${silBtnStyle}>Sil</button>
      <button class="btn-guncelle" data-city-id="${pkg.id}" ${guncelleBtnStyle}>Güncelle</button>
    </div>
  `;

  // Butonlara eylem ekle
  box.querySelector('.btn-indir').addEventListener('click', () => handleDownload(pkg.id));
  box.querySelector('.btn-sil').addEventListener('click', () => handleDelete(pkg.id));
  box.querySelector('.btn-guncelle').addEventListener('click', () => handleUpdate(pkg.id));

  container.appendChild(box);
  
  // (O 'Buraya' yorum satırına artık gerek kalmadı, çünkü bu mantığı ekledik)
}


// --- 4. BUTON EYLEMLERİ (TASLAK) ---

// "İndir" butonuna basıldığında
async function handleDownload(cityId) {
  console.log(`İndirme başlatılıyor: ${cityId}`);
  alert(`${cityId} için indirme başladı. (Bu kısım henüz kodlanmadı)`);

  // Burası "tane tane" gitmemiz gereken en karmaşık yer:
  // 1. "Mutfak"tan o 100MB'lık paketi çek (`/packages/details/:cityId`)
  // const response = await fetch(`${API_BASE}/packages/details/${cityId}`);
  // const packageData = await response.json();

  // 2. JSON verisini ('details') IndexedDB'deki 'markerDetails' tablosuna kaydet
  // for (const marker of packageData.details) {
  //   await saveToIndexedDB('markerDetails', { id: marker.id, data: marker, ... });
  // }

  // 3. Medya verisini ('media') tek tek çekip BLOB olarak kaydet
  //    (Bu, 'mediaCache' adında yeni bir IndexedDB tablosu gerektirir)
  // for (const media of packageData.media) {
  //   const mediaResponse = await fetch(media.url);
  //   const mediaBlob = await mediaResponse.blob();
  //   await saveMediaBlobToDB('mediaCache', media.fileName, mediaBlob);
  // }
  
  console.log(`İndirme bitti: ${cityId}`);
}

// "Sil" butonuna basıldığında
async function handleDelete(cityId) {
  console.log(`Silme başlatılıyor: ${cityId}`);
  alert(`${cityId} için silme işlemi. (Bu kısım henüz kodlanmadı)`);
  // Burası, 'markerDetails' ve 'mediaCache' tablolarından o şehre ait
  // tüm verileri silen bir döngü gerektirecek.
}

// "Güncelle" butonuna basıldığında (Senin "delta" fikrin)
async function handleUpdate(cityId) {
  // Şimdilik, Güncelle = Sil + İndir
  console.log(`Güncelleme (Sil + İndir) başlatılıyor: ${cityId}`);
  await handleDelete(cityId);
  await handleDownload(cityId);
}


// --- 5. BAŞLANGIÇ ---
// Sayfa HTML'i yüklendiğinde başla
window.addEventListener('DOMContentLoaded', async () => {
  await initIndexedDB(); // Önce "Kiler"i (IndexedDB) aç
  await loadPackages();  // Sonra "Mutfak"tan (API) paketleri çek
});