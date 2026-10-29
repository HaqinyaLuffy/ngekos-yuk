# Ngekos — versi PHP + MySQL untuk InfinityFree

Frontend (`index.html`, `auth.html`, `owner-*.html`, `assets/`) **tidak diubah**. Yang diganti hanya backend:
folder `api/` Node.js + Supabase → PHP + MySQL (`api/index.php`, `lib/`). Semua endpoint, fitur, dan format JSON
sama seperti versi Vercel: login/daftar, favorit, ulasan + rating otomatis, dashboard pemilik, unggah foto, tombol WhatsApp.

Syarat: PHP 7.4+ (pilih PHP 8.x di panel bila ada), MySQL/MariaDB.

## Cara deploy

**1. Buat database.** Client Area InfinityFree → *MySQL Databases* → buat database (mis. `ngekos`).
Catat empat hal: *MySQL Hostname* (mis. `sql123.infinityfree.com`), nama database lengkap (`if0_XXXXXXXX_ngekos`),
*MySQL Username* (`if0_XXXXXXXX`), dan password akun hosting.

**2. Impor tabel.** Buka *phpMyAdmin* dari daftar database → klik database Anda di panel kiri → tab **Import** →
pilih `database/schema.sql` → Go. (Opsional: impor juga `database/sample-data.sql` untuk 3 kos contoh; hapus nanti.)

**3. Isi konfigurasi.** Buka `config/config.php`, isi `db_host`, `db_name`, `db_user`, `db_pass` dari langkah 1.

**4. Unggah file.** Unggah **isi** folder ini (bukan foldernya) ke folder `htdocs` lewat FTP (mis. FileZilla)
atau File Manager. File `.htaccess` di setiap folder harus ikut terunggah (aktifkan "tampilkan file tersembunyi").
Hapus `index2.html` / file bawaan InfinityFree di `htdocs` jika ada. Pastikan `htdocs` adalah root domain:
frontend memakai alamat `/api/...` dan `/assets/...` dari akar domain.

**5. (Disarankan) Aktifkan SSL gratis** di Client Area → *Free SSL Certificates*. Cookie sesi otomatis memakai
atribut `Secure` saat situs dibuka lewat HTTPS.

**6. Coba.** Buka situs → daftar akun pencari kos → buka `/owner/register`, daftar pemilik, pasang kos dengan foto →
kembali ke beranda dan cek kos muncul, favorit, ulasan, dan tombol WhatsApp.

## Struktur

```
index.html, auth.html, owner-*.html, assets/   frontend (tidak berubah)
.htaccess            URL bersih (/login, /owner/dashboard, ...) + arahkan /api/* ke api/index.php
api/index.php        pengendali semua endpoint
lib/                 bootstrap.php (DB, sesi, JSON) dan handlers.php (endpoint)
config/config.php    kredensial database  (dikunci dari akses web)
database/            schema.sql, sample-data.sql (dikunci dari akses web)
uploads/             foto kos hasil unggahan pemilik (skrip PHP diblokir di sini)
```

## Catatan penting

- **Uji lewat browser, bukan curl/Postman.** InfinityFree memasang tantangan anti-bot (cookie `__test`) untuk
  klien non-browser; di browser ini ditangani otomatis.
- **Foto** disimpan di `uploads/` (bukan Supabase Storage), maksimal 3 MB per foto (diperkecil dulu di browser).
  Ruang disk gratis InfinityFree terbatas, jadi pantau pemakaiannya. Foto lama dihapus otomatis saat iklan dihapus/diganti.
- **Rating & jumlah ulasan** dihitung ulang oleh PHP setiap ulasan dikirim/dihapus (tidak memakai trigger database,
  karena hosting gratis biasanya tidak mengizinkan trigger).
- **Sesi** memakai sesi PHP bawaan (dua sesi terpisah: pencari kos dan pemilik, seperti sebelumnya).
- **Migrasi data dari Supabase (opsional).** Hash password bcrypt dari Supabase kompatibel dengan PHP, jadi akun lama
  bisa tetap login bila baris `users`/`owners`/`listings` diekspor CSV lalu diimpor lewat phpMyAdmin (kolom `features`
  harus berupa teks JSON, mis. `["WiFi","AC"]`). URL foto `https://...` dari Supabase tetap diterima.
- Jangan unggah `.env.local`, `.vercel`, `node_modules`, atau `package*.json` — tidak dipakai lagi di versi ini.

## Jika ada masalah

| Gejala | Penyebab / solusi |
|---|---|
| "Data belum tersedia" di beranda | Kredensial di `config/config.php` salah, atau `schema.sql` belum diimpor. Set `'debug' => true` sementara untuk melihat pesan asli di tab Network → respons `/api/listings`, lalu kembalikan ke `false`. |
| `/login` atau `/owner/dashboard` 404 | `.htaccess` di root belum terunggah. |
| Login berhasil tetapi langsung "keluar" | Buka situs lewat satu alamat konsisten (HTTP atau HTTPS, www atau tanpa www), jangan campur. |
| Unggah foto gagal "Terjadi kesalahan" | Pastikan folder `uploads/` ada dan dapat ditulis (izin 755). |
| Aksi ubah/hapus (PUT/DELETE) gagal | Beri tahu saya; metode ini bisa diganti POST di frontend bila hosting memblokirnya. |
