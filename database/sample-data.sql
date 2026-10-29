-- OPSIONAL: tiga data kos CONTOH agar beranda tidak kosong saat uji coba.
-- Ini BUKAN data asli Anda (file seed Supabase tidak ada di zip). Hapus lewat phpMyAdmin
-- atau pakai dashboard pemilik untuk memasang kos sungguhan.
SET NAMES utf8mb4;

INSERT INTO listings (name, location, city, price, period, type, rating, reviews, image, tag, features, description, contact_phone, is_active) VALUES
('Kos Contoh Melati', 'Dipatiukur, Bandung', 'Bandung', 1500000, 'bulan', 'Putri', 0, 0,
 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85',
 'Contoh', '["WiFi","AC","Kamar mandi dalam"]',
 'Data contoh untuk uji coba. Kamar bersih dengan akses mudah ke kampus.', NULL, 1),
('Kos Contoh Anggrek', 'Gubeng, Surabaya', 'Surabaya', 1200000, 'bulan', 'Putra', 0, 0,
 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85',
 'Contoh', '["WiFi","Kasur","Parkir motor"]',
 'Data contoh untuk uji coba. Dekat pusat kuliner dan transportasi umum.', NULL, 1),
('Kos Contoh Kenanga', 'Tembalang, Semarang', 'Semarang', 1000000, 'bulan', 'Campur', 0, 0,
 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85',
 'Contoh', '["WiFi","Dapur bersama"]',
 'Data contoh untuk uji coba. Suasana tenang dan lingkungan aman.', NULL, 1);
