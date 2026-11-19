import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3000;
const VERI_KLASORU = process.env.DISK_YOLU || import.meta.dirname;
const DB_DOSYA = path.join(VERI_KLASORU, 'data.json');
const GIZLI_ANAHTAR = process.env.JWT_SECRET || 'artisan-coffee-gizli-anahtar-2026';

async function veritabaniHazirla() {
  try {
    await fs.mkdir(VERI_KLASORU, { recursive: true });
    await fs.access(DB_DOSYA);
  } catch {
    const baslangicVerisi = {
      dukkanAyarlari: {
        ad: 'ARTISAN COFFEE',
        slogan: 'Taze Kavrulmuş Kahve & Hızlı Sipariş',
        logoUrl: ''
      },
      yonetici: {
        kullaniciAdi: 'kerim',
        sifreHash: crypto.createHash('sha256').update('kerim').digest('hex')
      },
      posAyarlari: {
        mod: 'test',
        apiKey: '',
        secretKey: '',
        baseUrl: 'https://sandbox-api.iyzipay.com'
      },
      urunler: [
        {
          id: crypto.randomUUID(),
          ad: 'Iced Caramel Macchiato',
          aciklama: 'Soğuk süt, espresso, vanilya şurubu ve karamel sos.',
          fiyat: 115,
          resim: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500',
          boyutlar: ['Küçük (Small)', 'Orta (Medium)', 'Büyük (Large)'],
          ekstralar: ['Normal Süt', 'Laktozsuz Süt', 'Yulaf Sütü', 'Ekstra Shot']
        },
        {
          id: crypto.randomUUID(),
          ad: 'Flat White',
          aciklama: 'Çift shot espresso üzerine kadifemsi mikro köpüklü süt.',
          fiyat: 95,
          resim: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=500',
          boyutlar: ['Küçük (Small)', 'Orta (Medium)', 'Büyük (Large)'],
          ekstralar: ['Normal Süt', 'Badem Sütü', 'Karamel Şurubu']
        }
      ],
      siparisler: []
    };
    await fs.writeFile(DB_DOSYA, JSON.stringify(baslangicVerisi, null, 2), 'utf8');
  }
}

async function veriOku() {
  const icerik = await fs.readFile(DB_DOSYA, 'utf8');
  return JSON.parse(icerik);
}

async function veriYaz(veri) {
  await fs.writeFile(DB_DOSYA, JSON.stringify(veri, null, 2), 'utf8');
}

function bodyOku(req) {
  return new Promise((resolve, reject) => {
    let govde = '';
    req.on('data', parca => { govde += parca.toString(); });
    req.on('end', () => {
      try {
        resolve(govde ? JSON.parse(govde) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function tokenOlustur(kullaniciAdi) {
  const veri = `${kullaniciAdi}:${Date.now()}`;
  const imza = crypto.createHmac('sha256', GIZLI_ANAHTAR).update(veri).digest('hex');
  return Buffer.from(`${veri}:${imza}`).toString('base64');
}

function yetkiliMi(req) {
  const token = req.headers['authorization'];
  if (!token) return false;
  try {
    const cozulmus = Buffer.from(token, 'base64').toString('utf8');
    const parcalar = cozulmus.split(':');
    if (parcalar.length !== 3) return false;
    const [kullaniciAdi, zaman, gelenImza] = parcalar;
    const beklenenImza = crypto.createHmac('sha256', GIZLI_ANAHTAR).update(`${kullaniciAdi}:${zaman}`).digest('hex');
    return gelenImza === beklenenImza;
  } catch {
    return false;
  }
}

function iyzicoImzaOlustur(apiKey, secretKey, uriYolu, istekGovdesi) {
  const rastgeleAnahtar = crypto.randomBytes(8).toString('hex');
  const imzaMetni = rastgeleAnahtar + uriYolu + JSON.stringify(istekGovdesi);
  const imza = crypto
    .createHmac('sha256', secretKey)
    .update(imzaMetni)
    .digest('hex');

  const authMetni = `apiKey:${apiKey}&randomKey:${rastgeleAnahtar}&signature:${imza}`;
  const base64Auth = Buffer.from(authMetni).toString('base64');

  return {
    authorization: `IYZWSv2 ${base64Auth}`,
    randomKey: rastgeleAnahtar
  };
}

await veritabaniHazirla();

const sunucu = http.createServer(async (req, res) => {
  if (req.method === 'GET' && !req.url.startsWith('/api/')) {
    let temizUrl = req.url.split('?')[0];
    let dosyaYolu = temizUrl === '/' ? 'index.html' : temizUrl.slice(1);
    const tamYol = path.join(import.meta.dirname, dosyaYolu);
    const uzanti = path.extname(tamYol);

    const mimeTipleri = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8'
    };

    try {
      const dosya = await fs.readFile(tamYol);
      res.writeHead(200, { 'Content-Type': mimeTipleri[uzanti] || 'text/plain' });
      return res.end(dosya);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Sayfa Bulunamadı');
    }
  }

  if (req.url.startsWith('/api/iyzico-callback') && req.method === 'POST') {
    const protokol = req.headers['x-forwarded-proto'] || 'http';
    const urlObj = new URL(req.url, `${protokol}://${req.headers.host}`);
    const siparisId = urlObj.searchParams.get('siparisId');
    const db = await veriOku();
    const siparis = db.siparisler.find(s => s.siparisNo === siparisId);
    if (siparis) {
      siparis.odemeDurumu = 'Ödendi (iyzico POS)';
      siparis.hazirlikDurumu = 'Yeni Sipariş';
      await veriYaz(db);
    }
    res.writeHead(302, { Location: `/?odeme=basarili&no=${siparisId}` });
    return res.end();
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    if (req.url === '/api/dukkan' && req.method === 'GET') {
      const db = await veriOku();
      res.writeHead(200);
      return res.end(JSON.stringify(db.dukkanAyarlari));
    }

    if (req.url === '/api/dukkan' && req.method === 'POST') {
      if (!yetkiliMi(req)) { res.writeHead(403); return res.end(JSON.stringify({ mesaj: 'Oturum süresi doldu, tekrar giriş yapın.' })); }
      const yeniAyar = await bodyOku(req);
      const db = await veriOku();
      db.dukkanAyarlari = yeniAyar;
      await veriYaz(db);
      res.writeHead(200);
      return res.end(JSON.stringify({ basarili: true }));
    }

    if (req.url === '/api/giris' && req.method === 'POST') {
      const { kullaniciAdi, sifre } = await bodyOku(req);
      const db = await veriOku();
      const girilenHash = crypto.createHash('sha256').update(sifre).digest('hex');

      if (kullaniciAdi === db.yonetici.kullaniciAdi && girilenHash === db.yonetici.sifreHash) {
        const token = tokenOlustur(db.yonetici.kullaniciAdi);
        res.writeHead(200);
        return res.end(JSON.stringify({ basarili: true, token, kullaniciAdi: db.yonetici.kullaniciAdi }));
      }
      res.writeHead(401);
      return res.end(JSON.stringify({ basarili: false, mesaj: 'Kullanıcı adı veya şifre hatalı!' }));
    }

    if (req.url === '/api/sifre-degistir' && req.method === 'POST') {
      if (!yetkiliMi(req)) { res.writeHead(403); return res.end(JSON.stringify({ mesaj: 'Oturum süresi doldu, tekrar giriş yapın.' })); }
      const { yeniKullaniciAdi, yeniSifre } = await bodyOku(req);
      const db = await veriOku();

      if (yeniKullaniciAdi) db.yonetici.kullaniciAdi = yeniKullaniciAdi.trim();
      if (yeniSifre) {
        db.yonetici.sifreHash = crypto.createHash('sha256').update(yeniSifre).digest('hex');
      }
      await veriYaz(db);
      res.writeHead(200);
      return res.end(JSON.stringify({ basarili: true }));
    }

    if (req.url === '/api/urunler' && req.method === 'GET') {
      const db = await veriOku();
      res.writeHead(200);
      return res.end(JSON.stringify(db.urunler));
    }

    if (req.url === '/api/urunler' && req.method === 'POST') {
      if (!yetkiliMi(req)) { res.writeHead(403); return res.end(JSON.stringify({ mesaj: 'Oturum süresi doldu, çıkış yapıp tekrar girin.' })); }
      const yeni = await bodyOku(req);
      const db = await veriOku();
      db.urunler.push({
        id: crypto.randomUUID(),
        ad: yeni.ad,
        aciklama: yeni.aciklama || '',
        fiyat: Number(yeni.fiyat),
        resim: yeni.resim || 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500',
        boyutlar: yeni.boyutlar,
        ekstralar: yeni.ekstralar
      });
      await veriYaz(db);
      res.writeHead(201);
      return res.end(JSON.stringify({ basarili: true }));
    }

    if (req.url.startsWith('/api/urunler/') && req.method === 'DELETE') {
      if (!yetkiliMi(req)) { res.writeHead(403); return res.end(JSON.stringify({ mesaj: 'Oturum süresi doldu, çıkış yapıp tekrar girin.' })); }
      const id = decodeURIComponent(req.url.split('/').pop());
      const db = await veriOku();
      db.urunler = db.urunler.filter(u => String(u.id) !== String(id));
      await veriYaz(db);
      res.writeHead(200);
      return res.end(JSON.stringify({ basarili: true }));
    }

    if (req.url === '/api/pos' && req.method === 'GET') {
      if (!yetkiliMi(req)) { res.writeHead(403); return res.end('{}'); }
      const db = await veriOku();
      res.writeHead(200);
      return res.end(JSON.stringify(db.posAyarlari));
    }

    if (req.url === '/api/pos' && req.method === 'POST') {
      if (!yetkiliMi(req)) { res.writeHead(403); return res.end(JSON.stringify({ mesaj: 'Oturum süresi doldu, tekrar giriş yapın.' })); }
      const ayarlar = await bodyOku(req);
      const db = await veriOku();
      db.posAyarlari = ayarlar;
      await veriYaz(db);
      res.writeHead(200);
      return res.end(JSON.stringify({ basarili: true }));
    }

    if (req.url === '/api/odeme-baslat' && req.method === 'POST') {
      const veri = await bodyOku(req);
      const db = await veriOku();
      const siparisId = 'KHV-' + crypto.randomUUID().slice(0, 6).toUpperCase();

      if (veri.testModu || db.posAyarlari.mod === 'test') {
        res.writeHead(200);
        return res.end(JSON.stringify({ basarili: true, mod: 'test', siparisId }));
      }

      if (!db.posAyarlari.apiKey || !db.posAyarlari.secretKey) {
        res.writeHead(400);
        return res.end(JSON.stringify({
          basarili: false,
          mesaj: 'iyzico API bilgileri girilmemiş! Test Ödemesi butonunu kullanın veya panelden API bilgilerini kaydedin.'
        }));
      }

      const uriYolu = '/payment/iyzipos/checkoutform/initialize/auth/ecom';
      const protokol = req.headers['x-forwarded-proto'] || 'http';
      const callbackUrl = `${protokol}://${req.headers.host}/api/iyzico-callback?siparisId=${siparisId}`;

      const iyzicoSepet = veri.sepet.map((kalem, idx) => ({
        id: 'URUN-' + (idx + 1),
        name: `${kalem.urunAd} (${kalem.boyut} - ${kalem.ekstra})`,
        category1: 'Kahve',
        itemType: 'PHYSICAL',
        price: String(kalem.fiyat * kalem.adet)
      }));

      const iyzicoIstek = {
        locale: 'tr',
        conversationId: siparisId,
        price: String(veri.toplamTutar),
        paidPrice: String(veri.toplamTutar),
        currency: 'TRY',
        basketId: siparisId,
        paymentGroup: 'PRODUCT',
        callbackUrl,
        buyer: {
          id: 'BY-' + siparisId,
          name: veri.musteriAd.split(' ')[0] || 'Musteri',
          surname: veri.musteriAd.split(' ').slice(1).join(' ') || 'Kahve',
          gsmNumber: '+905555555555',
          email: 'musteri@kahvedukkani.com',
          identityNumber: '11111111111',
          registrationAddress: veri.adres,
          ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '85.34.78.112',
          city: 'Istanbul',
          country: 'Turkey'
        },
        shippingAddress: {
          contactName: veri.musteriAd,
          city: 'Istanbul',
          country: 'Turkey',
          address: veri.adres
        },
        billingAddress: {
          contactName: veri.musteriAd,
          city: 'Istanbul',
          country: 'Turkey',
          address: veri.adres
        },
        basketItems: iyzicoSepet
      };

      const imzalar = iyzicoImzaOlustur(
        db.posAyarlari.apiKey,
        db.posAyarlari.secretKey,
        uriYolu,
        iyzicoIstek
      );

      const iyzicoYanit = await fetch(db.posAyarlari.baseUrl + uriYolu, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': imzalar.authorization,
          'x-iyzi-rnd': imzalar.randomKey
        },
        body: JSON.stringify(iyzicoIstek)
      });

      const iyzicoSonuc = await iyzicoYanit.json();

      if (iyzicoSonuc.status === 'success' && iyzicoSonuc.paymentPageUrl) {
        db.siparisler.unshift({
          siparisNo: siparisId,
          tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          musteriAd: veri.musteriAd,
          masaVeyaAdres: veri.adres,
          urunler: veri.sepet,
          toplamTutar: veri.toplamTutar,
          odemeDurumu: 'Ödeme Bekleniyor',
          hazirlikDurumu: 'Beklemede'
        });
        await veriYaz(db);

        res.writeHead(200);
        return res.end(JSON.stringify({
          basarili: true,
          mod: 'iyzico',
          odemeSayfasiUrl: iyzicoSonuc.paymentPageUrl
        }));
      } else {
        res.writeHead(400);
        return res.end(JSON.stringify({
          basarili: false,
          mesaj: 'iyzico Hatası: ' + (iyzicoSonuc.errorMessage || 'Bağlantı kurulamadı.')
        }));
      }
    }

    if (req.url === '/api/test-odeme-onay' && req.method === 'POST') {
      const veri = await bodyOku(req);
      const db = await veriOku();

      db.siparisler.unshift({
        siparisNo: veri.siparisId,
        tarih: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        musteriAd: veri.musteriAd,
        masaVeyaAdres: veri.adres,
        urunler: veri.sepet,
        toplamTutar: veri.toplamTutar,
        odemeDurumu: 'Ödendi (TEST POS)',
        hazirlikDurumu: 'Yeni Sipariş'
      });

      await veriYaz(db);
      res.writeHead(200);
      return res.end(JSON.stringify({ basarili: true }));
    }

    if (req.url === '/api/siparisler' && req.method === 'GET') {
      if (!yetkiliMi(req)) { res.writeHead(403); return res.end('[]'); }
      const db = await veriOku();
      res.writeHead(200);
      return res.end(JSON.stringify(db.siparisler));
    }

    if (req.url === '/api/siparis-durum' && req.method === 'POST') {
      if (!yetkiliMi(req)) { res.writeHead(403); return res.end('{}'); }
      const { siparisNo, yeniDurum } = await bodyOku(req);
      const db = await veriOku();
      const siparis = db.siparisler.find(s => s.siparisNo === siparisNo);
      if (siparis) {
        siparis.hazirlikDurumu = yeniDurum;
        await veriYaz(db);
      }
      res.writeHead(200);
      return res.end(JSON.stringify({ basarili: true }));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ mesaj: 'Uç nokta bulunamadı' }));
  } catch (hata) {
    res.writeHead(500);
    res.end(JSON.stringify({ mesaj: 'Sunucu hatası', detay: hata.message }));
  }
});

sunucu.listen(PORT, () => {
  console.log(`Kahve Dükkanı Sistemi Hazır (Port: ${PORT})`);
});
