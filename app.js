const ekranMagaza = document.getElementById('ekran-magaza');
const ekranGiris = document.getElementById('ekran-giris');
const ekranAdmin = document.getElementById('ekran-admin');

const btnMagaza = document.getElementById('btn-magaza');
const btnAdminGiris = document.getElementById('btn-admin-giris');
const btnCikis = document.getElementById('btn-cikis');
const modalSepet = document.getElementById('modal-sepet');

let sepet = JSON.parse(localStorage.getItem('kahveSepeti') || '[]');

function ekranGoster(ekran) {
  ekranMagaza.classList.add('gizli');
  ekranGiris.classList.add('gizli');
  ekranAdmin.classList.add('gizli');
  ekran.classList.remove('gizli');
}

document.addEventListener('DOMContentLoaded', () => {
  const parametreler = new URLSearchParams(window.location.search);
  if (parametreler.get('odeme') === 'basarili') {
    sepet = [];
    sepetiKaydet();
    const kutu = document.getElementById('bildirim-kutusu');
    kutu.textContent = `Ödemeniz başarıyla alındı! Sipariş No: ${parametreler.get('no')}. Kahveniz hazırlanıyor.`;
    kutu.classList.remove('gizli');
  }

  dukkanBilgileriniYukle();
  oturumKontrol();
  sepetSayaciGuncelle();
  urunleriYukle();
});

async function dukkanBilgileriniYukle() {
  const yanit = await fetch('/api/dukkan');
  const ayar = await yanit.json();

  document.title = ayar.ad + ' | Online Sipariş';
  document.getElementById('header-dukkan-ad').textContent = ayar.ad;
  document.getElementById('header-dukkan-slogan').textContent = ayar.slogan || '';

  const logoImg = document.getElementById('header-logo');
  if (ayar.logoUrl) {
    logoImg.src = ayar.logoUrl;
    logoImg.classList.remove('gizli');
  } else {
    logoImg.classList.add('gizli');
  }
}

function oturumKontrol() {
  const token = localStorage.getItem('adminToken');
  const kadi = localStorage.getItem('adminKadi') || 'Yönetici';
  if (token) {
    btnCikis.classList.remove('gizli');
    btnAdminGiris.textContent = `Panel (${kadi})`;
  } else {
    btnCikis.classList.add('gizli');
    btnAdminGiris.textContent = 'Dükkan Yönetimi';
  }
}

btnMagaza.addEventListener('click', () => {
  ekranGoster(ekranMagaza);
  urunleriYukle();
});

btnAdminGiris.addEventListener('click', () => {
  if (localStorage.getItem('adminToken')) {
    ekranGoster(ekranAdmin);
    adminVerileriniYukle();
  } else {
    ekranGoster(ekranGiris);
  }
});

btnCikis.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminKadi');
  oturumKontrol();
  ekranGoster(ekranMagaza);
});

document.getElementById('form-giris').addEventListener('submit', async (e) => {
  e.preventDefault();
  const kullaniciAdi = document.getElementById('giris-kadi').value;
  const sifre = document.getElementById('giris-sifre').value;

  const yanit = await fetch('/api/giris', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kullaniciAdi, sifre })
  });
  const sonuc = await yanit.json();

  if (sonuc.basarili) {
    localStorage.setItem('adminToken', sonuc.token);
    localStorage.setItem('adminKadi', sonuc.kullaniciAdi);
    oturumKontrol();
    ekranGoster(ekranAdmin);
    adminVerileriniYukle();
  } else {
    alert(sonuc.mesaj);
  }
});

async function urunleriYukle() {
  const yanit = await fetch('/api/urunler');
  const urunler = await yanit.json();
  const liste = document.getElementById('urun-listesi');
  liste.innerHTML = '';

  urunler.forEach(urun => {
    const kart = document.createElement('article');
    kart.className = 'urun-kart';

    const boyutSecenekler = urun.boyutlar.map(b => `<option value="${b}">${b}</option>`).join('');
    const ekstraSecenekler = (urun.ekstralar || ['Standart']).map(ex => `<option value="${ex}">${ex}</option>`).join('');

    kart.innerHTML = `
      <img src="${urun.resim}" alt="${urun.ad}">
      <div class="urun-icerik">
        <h3>${urun.ad}</h3>
        <p>${urun.aciklama}</p>
        <div class="fiyat">${urun.fiyat} TL</div>
        
        <span class="secim-etiket">Boyut Seçimi:</span>
        <select class="boyut-secici">${boyutSecenekler}</select>
        
        <span class="secim-etiket">Süt / Ekstra Tercihi:</span>
        <select class="ekstra-secici">${ekstraSecenekler}</select>
        
        <button class="birincil-btn sepete-ekle-btn">Sepete Ekle</button>
      </div>
    `;

    kart.querySelector('.sepete-ekle-btn').addEventListener('click', (e) => {
      const boyut = kart.querySelector('.boyut-secici').value;
      const ekstra = kart.querySelector('.ekstra-secici').value;
      sepeteEkle(urun, boyut, ekstra);

      const orijinalYazi = e.target.textContent;
      e.target.textContent = '✓ Sepete Eklendi';
      setTimeout(() => { e.target.textContent = orijinalYazi; }, 900);
    });

    liste.appendChild(kart);
  });
}

function sepetiKaydet() {
  localStorage.setItem('kahveSepeti', JSON.stringify(sepet));
  sepetSayaciGuncelle();
}

function sepetSayaciGuncelle() {
  const toplamAdet = sepet.reduce((toplam, item) => toplam + item.adet, 0);
  document.getElementById('sepet-sayac').textContent = toplamAdet;
}

function sepeteEkle(urun, boyut, ekstra) {
  const mevcut = sepet.find(item => item.urunAd === urun.ad && item.boyut === boyut && item.ekstra === ekstra);
  if (mevcut) {
    mevcut.adet += 1;
  } else {
    sepet.push({ urunAd: urun.ad, fiyat: urun.fiyat, boyut, ekstra, adet: 1 });
  }
  sepetiKaydet();
}

document.getElementById('btn-sepet-ac').addEventListener('click', () => {
  sepetModaliniCiz();
  modalSepet.showModal();
});

document.getElementById('btn-modal-kapat').addEventListener('click', () => modalSepet.close());

function sepetModaliniCiz() {
  const liste = document.getElementById('sepet-icerik-listesi');
  const toplamKutu = document.getElementById('sepet-toplam-ozet');

  if (sepet.length === 0) {
    liste.innerHTML = '<p style="text-align:center; color:#78716c;">Sepetiniz şu an boş.</p>';
    toplamKutu.textContent = 'Toplam: 0 TL';
    return;
  }

  let genelToplam = 0;
  liste.innerHTML = sepet.map((item, index) => {
    const araToplam = item.fiyat * item.adet;
    genelToplam += araToplam;
    return `
      <div class="sepet-kalem">
        <div>
          <strong>${item.adet}x ${item.urunAd}</strong><br>
          <small>${item.boyut} • ${item.ekstra}</small>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong>${araToplam} TL</strong>
          <button type="button" class="sil-btn sepet-sil" data-idx="${index}">Sil</button>
        </div>
      </div>
    `;
  }).join('');

  toplamKutu.textContent = `Toplam Tutar: ${genelToplam} TL`;

  document.querySelectorAll('.sepet-sil').forEach(btn => {
    btn.addEventListener('click', (e) => {
      sepet.splice(Number(e.target.dataset.idx), 1);
      sepetiKaydet();
      sepetModaliniCiz();
    });
  });
}

async function odemeSureciniBaslat(testModuMu) {
  if (sepet.length === 0) {
    alert('Ödeme yapmak için sepete en az 1 ürün eklemelisiniz.');
    return;
  }

  const musteriAd = document.getElementById('musteri-ad').value.trim();
  const adres = document.getElementById('musteri-adres').value.trim();

  if (!musteriAd || !adres) {
    alert('Lütfen adınızı ve masa/adres bilginizi girin.');
    return;
  }

  const toplamTutar = sepet.reduce((t, i) => t + (i.fiyat * i.adet), 0);
  const gonderilecek = { sepet, toplamTutar, musteriAd, adres, testModu: testModuMu };

  const yanit = await fetch('/api/odeme-baslat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gonderilecek)
  });
  const sonuc = await yanit.json();

  if (!sonuc.basarili) {
    alert(sonuc.mesaj);
    return;
  }

  if (sonuc.mod === 'test') {
    await fetch('/api/test-odeme-onay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...gonderilecek, siparisId: sonuc.siparisId })
    });

    sepet = [];
    sepetiKaydet();
    modalSepet.close();

    const kutu = document.getElementById('bildirim-kutusu');
    kutu.textContent = `TEST ÖDEMESİ BAŞARILI! Sipariş No: ${sonuc.siparisId} — Dükkan paneline iletildi.`;
    kutu.classList.remove('gizli');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (sonuc.mod === 'iyzico') {
    window.location.href = sonuc.odemeSayfasiUrl;
  }
}

document.getElementById('btn-gercek-ode').addEventListener('click', () => odemeSureciniBaslat(false));
document.getElementById('btn-test-ode').addEventListener('click', () => odemeSureciniBaslat(true));

document.getElementById('btn-siparis-yenile').addEventListener('click', adminVerileriniYukle);

async function adminVerileriniYukle() {
  const token = localStorage.getItem('adminToken');
  const headers = { 'Authorization': token };

  const dukkanYanit = await fetch('/api/dukkan');
  const dukkan = await dukkanYanit.json();
  document.getElementById('ayar-dukkan-ad').value = dukkan.ad || '';
  document.getElementById('ayar-dukkan-slogan').value = dukkan.slogan || '';
  document.getElementById('ayar-dukkan-logo').value = dukkan.logoUrl || '';
  document.getElementById('ayar-yeni-kadi').value = localStorage.getItem('adminKadi') || 'kerim';

  const posYanit = await fetch('/api/pos', { headers });
  if (posYanit.ok) {
    const pos = await posYanit.json();
    document.getElementById('pos-mod').value = pos.mod || 'test';
    document.getElementById('pos-apikey').value = pos.apiKey || '';
    document.getElementById('pos-secretkey').value = pos.secretKey || '';
    document.getElementById('pos-baseurl').value = pos.baseUrl || 'https://sandbox-api.iyzipay.com';
  }

  const siparisYanit = await fetch('/api/siparisler', { headers });
  if (siparisYanit.ok) {
    const siparisler = await siparisYanit.json();
    const tablo = document.getElementById('siparis-tablosu');
    tablo.innerHTML = siparisler.map(s => {
      const urunDetay = (s.urunler || []).map(u => `${u.adet}x ${u.urunAd} (${u.boyut}, ${u.ekstra})`).join('<br>');
      return `
        <tr>
          <td><strong>${s.siparisNo}</strong></td>
          <td>${s.tarih}</td>
          <td>${s.musteriAd}<br><small>${s.masaVeyaAdres}</small></td>
          <td>${urunDetay}</td>
          <td><strong>${s.toplamTutar} TL</strong></td>
          <td>${s.odemeDurumu}</td>
          <td>
            <select class="durum-degistir" data-no="${s.siparisNo}">
              <option value="Yeni Sipariş" ${s.hazirlikDurumu === 'Yeni Sipariş' ? 'selected' : ''}>Yeni Sipariş</option>
              <option value="Hazırlanıyor" ${s.hazirlikDurumu === 'Hazırlanıyor' ? 'selected' : ''}>Hazırlanıyor</option>
              <option value="Teslim Edildi" ${s.hazirlikDurumu === 'Teslim Edildi' ? 'selected' : ''}>Teslim Edildi</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.durum-degistir').forEach(secici => {
      secici.addEventListener('change', async (e) => {
        await fetch('/api/siparis-durum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': token },
          body: JSON.stringify({ siparisNo: e.target.dataset.no, yeniDurum: e.target.value })
        });
      });
    });
  }

  const urunYanit = await fetch('/api/urunler');
  const urunler = await urunYanit.json();
  document.getElementById('admin-urun-listesi').innerHTML = urunler.map(u => `
    <div class="mini-kart">
      <div><strong>${u.ad}</strong><br><small>${u.fiyat} TL</small></div>
      <button class="sil-btn" data-id="${u.id}">Sil</button>
    </div>
  `).join('');

  document.querySelectorAll('#admin-urun-listesi .sil-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('Bu ürünü menüden silmek istiyor musunuz?')) return;
      await fetch(`/api/urunler/${e.target.dataset.id}`, { method: 'DELETE', headers });
      adminVerileriniYukle();
    });
  });
}

document.getElementById('form-dukkan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('adminToken');
  const yeniAyar = {
    ad: document.getElementById('ayar-dukkan-ad').value,
    slogan: document.getElementById('ayar-dukkan-slogan').value,
    logoUrl: document.getElementById('ayar-dukkan-logo').value
  };

  await fetch('/api/dukkan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify(yeniAyar)
  });

  dukkanBilgileriniYukle();
  alert('Dükkan adı ve logo bilgileri güncellendi!');
});

document.getElementById('form-sifre').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('adminToken');
  const yeniKullaniciAdi = document.getElementById('ayar-yeni-kadi').value;
  const yeniSifre = document.getElementById('ayar-yeni-sifre').value;

  await fetch('/api/sifre-degistir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ yeniKullaniciAdi, yeniSifre })
  });

  localStorage.setItem('adminKadi', yeniKullaniciAdi);
  oturumKontrol();
  document.getElementById('ayar-yeni-sifre').value = '';
  alert('Giriş bilgileriniz başarıyla güncellendi!');
});

document.getElementById('form-pos').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('adminToken');
  const ayarlar = {
    mod: document.getElementById('pos-mod').value,
    apiKey: document.getElementById('pos-apikey').value,
    secretKey: document.getElementById('pos-secretkey').value,
    baseUrl: document.getElementById('pos-baseurl').value
  };

  await fetch('/api/pos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify(ayarlar)
  });

  alert('POS ayarları kaydedildi!');
});

document.getElementById('form-urun').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('adminToken');

  const boyutlar = Array.from(document.querySelectorAll('input[name="boyut"]:checked')).map(c => c.value);
  const ekstralar = document.getElementById('urun-ekstralar').value.split(',').map(s => s.trim()).filter(Boolean);

  const yeniUrun = {
    ad: document.getElementById('urun-ad').value,
    aciklama: document.getElementById('urun-aciklama').value,
    resim: document.getElementById('urun-resim').value,
    fiyat: document.getElementById('urun-fiyat').value,
    boyutlar: boyutlar.length ? boyutlar : ['Standart'],
    ekstralar: ekstralar.length ? ekstralar : ['Standart']
  };

  await fetch('/api/urunler', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify(yeniUrun)
  });

  alert('Yeni kahve menüye eklendi!');
  e.target.reset();
  adminVerileriniYukle();
});
