<?php
declare(strict_types=1);

// Endpoint API. Kontrak JSON sama dengan versi Node.js/Vercel sehingga assets/*.js tidak perlu diubah.

const TYPES = ['Putri', 'Putra', 'Campur'];
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

// ---------- Pembantu ----------

function fetchOne(string $sql, array $params = []): ?array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    $row = $st->fetch();
    return $row === false ? null : $row;
}

function decodeFeatures($raw): array
{
    $list = json_decode((string) $raw, true);
    return is_array($list) ? array_values($list) : [];
}

function isDuplicate(PDOException $e): bool
{
    return (string) $e->getCode() === '23000';
}

function maskName(?string $name): string
{
    $clean = trim((string) $name);
    $len = textLen($clean);
    if ($len <= 2) {
        return ($len > 0 ? textSub($clean, 0, 1) : 'P') . '***';
    }
    return textSub($clean, 0, 1) . '***' . textSub($clean, $len - 1, 1);
}

function refreshListingRating(int $listingId): void
{
    db()->prepare(
        'UPDATE listings SET
            reviews = (SELECT COUNT(*) FROM reviews WHERE listing_id = ?),
            rating = COALESCE((SELECT ROUND(AVG(rating), 1) FROM reviews WHERE listing_id = ?), 0)
         WHERE id = ?'
    )->execute([$listingId, $listingId, $listingId]);
}

function publicListing(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'name' => $r['name'],
        'location' => $r['location'],
        'city' => $r['city'],
        'price' => (int) $r['price'],
        'period' => $r['period'],
        'type' => $r['type'],
        'rating' => (float) $r['rating'],
        'reviews' => (int) $r['reviews'],
        'image' => $r['image'],
        'tag' => $r['tag'],
        'features' => decodeFeatures($r['features']),
        'description' => $r['description'],
    ];
}

function ownerListing(array $r): array
{
    return publicListing($r) + [
        'is_active' => (bool) $r['is_active'],
        'contact_phone' => $r['contact_phone'],
        'created_at' => iso($r['created_at']),
    ];
}

function uploadsDir(): string
{
    return dirname(__DIR__) . '/uploads';
}

// Hapus berkas foto lokal bila tidak lagi dipakai kos mana pun.
function cleanupUpload(?string $image): void
{
    if ($image === null || strpos($image, '/uploads/') !== 0 || strpos($image, '..') !== false) {
        return;
    }
    $used = fetchOne('SELECT COUNT(*) AS n FROM listings WHERE image = ?', [$image]);
    if ($used !== null && (int) $used['n'] > 0) {
        return;
    }
    $file = uploadsDir() . '/' . substr($image, strlen('/uploads/'));
    $real = realpath($file);
    $root = realpath(uploadsDir());
    if ($real !== false && $root !== false && strpos($real, $root . DIRECTORY_SEPARATOR) === 0 && is_file($real)) {
        @unlink($real);
    }
}

// ---------- /api/auth/* (pencari kos) ----------

function h_auth_login(): void
{
    requireMethod('POST');
    $b = jsonBody();
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $password = (string) ($b['password'] ?? '');
    if ($email === '' || $password === '') {
        fail(422, 'Email dan password wajib diisi.');
    }
    $user = fetchOne('SELECT id, name, email, password_hash, role FROM users WHERE email = ?', [$email]);
    // password_verify tetap dijalankan untuk email tak dikenal agar waktu respons seragam.
    $ok = password_verify($password, $user['password_hash'] ?? DUMMY_HASH);
    if ($user === null || !$ok) {
        fail(401, 'Email atau password salah.');
    }
    $safe = ['id' => (int) $user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']];
    setSession($safe, 'user');
    respond(200, ['user' => $safe]);
}

function h_auth_register(): void
{
    requireMethod('POST');
    $b = jsonBody();
    $name = trim((string) ($b['name'] ?? ''));
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $password = (string) ($b['password'] ?? '');
    if ($name === '' || $email === '' || $password === '') {
        fail(422, 'Nama, email, dan password wajib diisi.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        fail(422, 'Email tidak valid.');
    }
    if (textLen($name) > 100) {
        fail(422, 'Nama terlalu panjang.');
    }
    if (textLen($password) < 8) {
        fail(422, 'Password minimal 8 karakter.');
    }
    if ($password !== (string) ($b['passwordConfirmation'] ?? '')) {
        fail(422, 'Konfirmasi password tidak sama.');
    }
    if (fetchOne('SELECT id FROM users WHERE email = ?', [$email]) !== null) {
        fail(409, 'Email tersebut sudah terdaftar.');
    }
    try {
        db()->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
            ->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
    } catch (PDOException $e) {
        if (isDuplicate($e)) {
            fail(409, 'Email tersebut sudah terdaftar.');
        }
        throw $e;
    }
    $safe = ['id' => (int) db()->lastInsertId(), 'name' => $name, 'email' => $email, 'role' => 'tenant'];
    setSession($safe, 'user');
    respond(201, ['user' => $safe]);
}

function h_auth_logout(): void
{
    clearSession('user');
    respond(200, ['ok' => true]);
}

function h_auth_me(): void
{
    respond(200, ['user' => readSession('user')]);
}

// ---------- /api/listings ----------

function h_listings(): void
{
    requireMethod('GET');

    if (isset($_GET['contact'])) {
        if (readSession('user') === null) {
            fail(401, 'Masuk untuk menghubungi pemilik kos.');
        }
        $id = toInt($_GET['contact']);
        if ($id === null) {
            fail(422, 'ID kos tidak valid.');
        }
        $row = fetchOne('SELECT name, contact_phone FROM listings WHERE id = ? AND is_active = 1', [$id]);
        if ($row === null || empty($row['contact_phone'])) {
            fail(404, 'Nomor pemilik belum tersedia untuk kos ini.');
        }
        $message = rawurlencode('Halo, saya tertarik dengan ' . $row['name'] . ' di Ngekos. Apakah masih tersedia?');
        respond(200, ['phone' => $row['contact_phone'], 'url' => 'https://wa.me/' . $row['contact_phone'] . '?text=' . $message]);
    }

    $rows = db()->query(
        'SELECT id, name, location, city, price, period, type, rating, reviews, image, tag, features, description
         FROM listings WHERE is_active = 1 ORDER BY id'
    )->fetchAll();
    respond(200, array_map('publicListing', $rows));
}

// ---------- /api/reviews ----------

function h_reviews(): void
{
    $m = method();

    if ($m === 'GET') {
        $listingId = toInt($_GET['listingId'] ?? null);
        if ($listingId === null) {
            fail(422, 'listingId tidak valid.');
        }
        $viewer = readSession('user');
        $st = db()->prepare(
            'SELECT r.id, r.user_id, r.rating, r.comment, r.created_at, u.name AS author_name
             FROM reviews r LEFT JOIN users u ON u.id = r.user_id
             WHERE r.listing_id = ? ORDER BY r.created_at DESC, r.id DESC'
        );
        $st->execute([$listingId]);
        $reviews = [];
        $distribution = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        $sum = 0;
        foreach ($st->fetchAll() as $row) {
            $rating = (int) $row['rating'];
            $reviews[] = [
                'id' => (int) $row['id'],
                'rating' => $rating,
                'comment' => $row['comment'],
                'createdAt' => iso($row['created_at']),
                'author' => maskName($row['author_name']),
                'mine' => $viewer !== null && (int) $viewer['id'] === (int) $row['user_id'],
            ];
            if (isset($distribution[$rating])) {
                $distribution[$rating]++;
            }
            $sum += $rating;
        }
        $count = count($reviews);
        $average = $count ? round($sum / $count, 1) : 0;
        respond(200, ['reviews' => $reviews, 'summary' => ['count' => $count, 'average' => $average, 'distribution' => $distribution]]);
    }

    if ($m === 'POST') {
        $user = requireSession('user');
        $b = jsonBody();
        $listingId = toInt($b['listingId'] ?? null);
        $rating = toInt($b['rating'] ?? null);
        $comment = trim((string) ($b['comment'] ?? ''));
        if ($listingId === null) {
            fail(422, 'Kos tidak valid.');
        }
        if ($rating === null || $rating < 1 || $rating > 5) {
            fail(422, 'Rating harus 1 sampai 5.');
        }
        if (textLen($comment) > 500) {
            fail(422, 'Komentar maksimal 500 karakter.');
        }
        if (fetchOne('SELECT id FROM listings WHERE id = ? AND is_active = 1', [$listingId]) === null) {
            fail(404, 'Kos tidak ditemukan.');
        }
        db()->prepare(
            'INSERT INTO reviews (listing_id, user_id, rating, comment) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), updated_at = CURRENT_TIMESTAMP'
        )->execute([$listingId, (int) $user['id'], $rating, $comment]);
        refreshListingRating($listingId);
        respond(201, ['ok' => true]);
    }

    if ($m === 'DELETE') {
        $user = requireSession('user');
        $id = toInt($_GET['id'] ?? null);
        if ($id === null) {
            fail(422, 'ID ulasan tidak valid.');
        }
        $row = fetchOne('SELECT listing_id FROM reviews WHERE id = ? AND user_id = ?', [$id, (int) $user['id']]);
        if ($row === null) {
            fail(404, 'Ulasan tidak ditemukan.');
        }
        db()->prepare('DELETE FROM reviews WHERE id = ? AND user_id = ?')->execute([$id, (int) $user['id']]);
        refreshListingRating((int) $row['listing_id']);
        respond(200, ['ok' => true]);
    }

    fail(405, 'Method tidak diizinkan.');
}

// ---------- /api/favorites ----------

function h_favorites(): void
{
    $user = requireSession('user');
    $uid = (int) $user['id'];
    $m = method();

    if ($m === 'GET') {
        $st = db()->prepare('SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC, listing_id DESC');
        $st->execute([$uid]);
        respond(200, ['ids' => array_map('intval', array_column($st->fetchAll(), 'listing_id'))]);
    }

    if ($m === 'POST') {
        $b = jsonBody();
        $raw = isset($b['listingIds']) && is_array($b['listingIds']) ? $b['listingIds'] : [$b['listingId'] ?? null];
        $ids = [];
        foreach ($raw as $value) {
            $id = toInt($value);
            if ($id !== null && $id > 0) {
                $ids[$id] = $id;
            }
        }
        $ids = array_slice(array_values($ids), 0, 100);
        if (!$ids) {
            fail(422, 'Kos tidak valid.');
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $st = db()->prepare("SELECT id FROM listings WHERE is_active = 1 AND id IN ($marks)");
        $st->execute($ids);
        $valid = array_map('intval', array_column($st->fetchAll(), 'id'));
        if (!$valid) {
            fail(404, 'Kos tidak ditemukan.');
        }
        $rowMarks = implode(',', array_fill(0, count($valid), '(?, ?)'));
        $params = [];
        foreach ($valid as $listingId) {
            $params[] = $uid;
            $params[] = $listingId;
        }
        db()->prepare("INSERT IGNORE INTO favorites (user_id, listing_id) VALUES $rowMarks")->execute($params);
        respond(201, ['ok' => true, 'ids' => $valid]);
    }

    if ($m === 'DELETE') {
        $listingId = toInt($_GET['listingId'] ?? null);
        if ($listingId === null) {
            fail(422, 'Kos tidak valid.');
        }
        db()->prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?')->execute([$uid, $listingId]);
        respond(200, ['ok' => true]);
    }

    fail(405, 'Method tidak diizinkan.');
}

// ---------- /api/owner/auth?action=login|register|logout|me ----------

function h_owner_auth(): void
{
    $action = (string) ($_GET['action'] ?? '');

    if ($action === 'me') {
        respond(200, ['owner' => readSession('owner')]);
    }
    requireMethod('POST');

    if ($action === 'logout') {
        clearSession('owner');
        respond(200, ['ok' => true]);
    }

    $b = jsonBody();
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    $password = (string) ($b['password'] ?? '');

    if ($action === 'login') {
        if ($email === '' || $password === '') {
            fail(422, 'Email dan password wajib diisi.');
        }
        $owner = fetchOne('SELECT id, name, email, whatsapp, password_hash FROM owners WHERE email = ?', [$email]);
        $ok = password_verify($password, $owner['password_hash'] ?? DUMMY_HASH);
        if ($owner === null || !$ok) {
            fail(401, 'Email atau password salah.');
        }
        $safe = ['id' => (int) $owner['id'], 'name' => $owner['name'], 'email' => $owner['email'], 'whatsapp' => $owner['whatsapp'], 'role' => 'owner'];
        setSession($safe, 'owner');
        respond(200, ['owner' => $safe]);
    }

    if ($action === 'register') {
        $name = trim((string) ($b['name'] ?? ''));
        $whatsapp = normalizePhone($b['whatsapp'] ?? '');
        if ($name === '' || $email === '' || $password === '') {
            fail(422, 'Nama, email, dan password wajib diisi.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            fail(422, 'Email tidak valid.');
        }
        if ($whatsapp === null) {
            fail(422, 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.');
        }
        if (textLen($name) > 100) {
            fail(422, 'Nama terlalu panjang.');
        }
        if (textLen($password) < 8) {
            fail(422, 'Password minimal 8 karakter.');
        }
        if ($password !== (string) ($b['passwordConfirmation'] ?? '')) {
            fail(422, 'Konfirmasi password tidak sama.');
        }
        if (fetchOne('SELECT id FROM owners WHERE email = ?', [$email]) !== null) {
            fail(409, 'Email tersebut sudah terdaftar sebagai pemilik kos.');
        }
        try {
            db()->prepare('INSERT INTO owners (name, email, whatsapp, password_hash) VALUES (?, ?, ?, ?)')
                ->execute([$name, $email, $whatsapp, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $e) {
            if (isDuplicate($e)) {
                fail(409, 'Email tersebut sudah terdaftar sebagai pemilik kos.');
            }
            throw $e;
        }
        $safe = ['id' => (int) db()->lastInsertId(), 'name' => $name, 'email' => $email, 'whatsapp' => $whatsapp, 'role' => 'owner'];
        setSession($safe, 'owner');
        respond(201, ['owner' => $safe]);
    }

    fail(404, 'Aksi tidak dikenal.');
}

// ---------- /api/owner/listings ----------

function parseFeatures($value): array
{
    $list = is_array($value) ? $value : explode(',', (string) $value);
    $clean = [];
    foreach ($list as $item) {
        $item = trim((string) $item);
        if ($item !== '') {
            $clean[] = $item;
        }
    }
    return array_slice($clean, 0, 8);
}

// Mengembalikan [values, error].
function buildListingValues(array $b, array $owner): array
{
    $name = trim((string) ($b['name'] ?? ''));
    $location = trim((string) ($b['location'] ?? ''));
    $city = trim((string) ($b['city'] ?? ''));
    $description = trim((string) ($b['description'] ?? ''));
    $price = toInt($b['price'] ?? null);
    $image = trim((string) ($b['image'] ?? ''));
    $type = (string) ($b['type'] ?? '');
    $phone = !empty($b['contactPhone']) ? normalizePhone($b['contactPhone']) : normalizePhone($owner['whatsapp'] ?? '');

    if ($name === '' || $location === '' || $city === '' || $description === '') {
        return [null, 'Nama, lokasi, kota, dan deskripsi wajib diisi.'];
    }
    if (textLen($name) > 150 || textLen($location) > 200 || textLen($city) > 100 || textLen($description) > 1000) {
        return [null, 'Teks terlalu panjang.'];
    }
    if ($price === null || $price < 100000 || $price > 100000000) {
        return [null, 'Harga per bulan tidak valid (minimal Rp100.000).'];
    }
    if (!in_array($type, TYPES, true)) {
        return [null, 'Tipe kos harus Putri, Putra, atau Campur.'];
    }
    if (strlen($image) > 500 || !preg_match('#^(https?://|/uploads/)#', $image) || strpos($image, '..') !== false) {
        return [null, 'Foto kos wajib diunggah.'];
    }
    if ($phone === null) {
        return [null, 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.'];
    }
    $tag = textSub(trim((string) ($b['tag'] ?? '')), 0, 80);

    return [[
        'name' => $name,
        'location' => $location,
        'city' => $city,
        'description' => $description,
        'price' => $price,
        'type' => $type,
        'image' => $image,
        'tag' => $tag !== '' ? $tag : 'Baru',
        'features' => json_encode(parseFeatures($b['features'] ?? ''), JSON_UNESCAPED_UNICODE),
        'contact_phone' => $phone,
        'is_active' => array_key_exists('isActive', $b) ? ($b['isActive'] ? 1 : 0) : 1,
    ], null];
}

const OWNER_FIELDS = 'id, name, location, city, price, period, type, rating, reviews, image, tag, features, description, is_active, contact_phone, created_at';

function h_owner_listings(): void
{
    $owner = requireSession('owner');
    $oid = (int) $owner['id'];
    $m = method();
    $id = toInt($_GET['id'] ?? null);

    if ($m === 'GET') {
        $st = db()->prepare('SELECT ' . OWNER_FIELDS . ' FROM listings WHERE owner_id = ? ORDER BY id DESC');
        $st->execute([$oid]);
        respond(200, array_map('ownerListing', $st->fetchAll()));
    }

    if ($m === 'POST') {
        [$v, $error] = buildListingValues(jsonBody(), $owner);
        if ($error !== null) {
            fail(422, $error);
        }
        db()->prepare(
            'INSERT INTO listings (owner_id, name, location, city, price, type, image, tag, features, description, contact_phone, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$oid, $v['name'], $v['location'], $v['city'], $v['price'], $v['type'], $v['image'], $v['tag'], $v['features'], $v['description'], $v['contact_phone'], $v['is_active']]);
        $row = fetchOne('SELECT ' . OWNER_FIELDS . ' FROM listings WHERE id = ?', [(int) db()->lastInsertId()]);
        respond(201, ownerListing($row));
    }

    if ($m === 'PUT' || $m === 'DELETE') {
        if ($id === null) {
            fail(422, 'ID kos tidak valid.');
        }
        $existing = fetchOne('SELECT ' . OWNER_FIELDS . ' FROM listings WHERE id = ? AND owner_id = ?', [$id, $oid]);
        if ($existing === null) {
            fail(404, 'Kos tidak ditemukan.');
        }

        if ($m === 'DELETE') {
            db()->prepare('DELETE FROM listings WHERE id = ? AND owner_id = ?')->execute([$id, $oid]);
            cleanupUpload($existing['image']);
            respond(200, ['ok' => true]);
        }

        [$v, $error] = buildListingValues(jsonBody(), $owner);
        if ($error !== null) {
            fail(422, $error);
        }
        db()->prepare(
            'UPDATE listings SET name = ?, location = ?, city = ?, price = ?, type = ?, image = ?, tag = ?, features = ?,
                    description = ?, contact_phone = ?, is_active = ?
             WHERE id = ? AND owner_id = ?'
        )->execute([$v['name'], $v['location'], $v['city'], $v['price'], $v['type'], $v['image'], $v['tag'], $v['features'], $v['description'], $v['contact_phone'], $v['is_active'], $id, $oid]);
        if ($existing['image'] !== $v['image']) {
            cleanupUpload($existing['image']);
        }
        respond(200, ownerListing(fetchOne('SELECT ' . OWNER_FIELDS . ' FROM listings WHERE id = ?', [$id])));
    }

    fail(405, 'Method tidak diizinkan.');
}

// ---------- /api/owner/upload ----------

function detectImageType(string $bytes): ?array
{
    if (strlen($bytes) > 3 && substr($bytes, 0, 3) === "\xFF\xD8\xFF") {
        return ['image/jpeg', 'jpg'];
    }
    if (strlen($bytes) > 8 && substr($bytes, 0, 8) === "\x89PNG\r\n\x1A\n") {
        return ['image/png', 'png'];
    }
    if (strlen($bytes) > 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') {
        return ['image/webp', 'webp'];
    }
    return null;
}

// Menerima { data: "<base64 / data URL>" } (sudah diperkecil di browser), menyimpan ke folder uploads/.
function h_owner_upload(): void
{
    requireMethod('POST');
    $owner = requireSession('owner');

    $base64 = preg_replace('#^data:[^;]+;base64,#', '', (string) (jsonBody()['data'] ?? ''));
    $base64 = preg_replace('/\s+/', '', (string) $base64);
    $bytes = $base64 === '' ? '' : base64_decode((string) $base64, true);
    if ($bytes === false || $bytes === '') {
        fail(422, 'File gambar kosong.');
    }
    if (strlen($bytes) > MAX_UPLOAD_BYTES) {
        fail(413, 'Ukuran gambar maksimal 3 MB.');
    }
    $type = detectImageType($bytes);
    if ($type === null || @getimagesizefromstring($bytes) === false) {
        fail(422, 'Format gambar harus JPG, PNG, atau WebP.');
    }

    $dir = uploadsDir() . '/' . (int) $owner['id'];
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Folder uploads tidak bisa dibuat. Periksa izin folder.');
    }
    $filename = time() . '-' . bin2hex(random_bytes(5)) . '.' . $type[1];
    if (file_put_contents($dir . '/' . $filename, $bytes) === false) {
        throw new RuntimeException('Gagal menulis berkas ke folder uploads.');
    }
    @chmod($dir . '/' . $filename, 0644);
    respond(201, ['url' => '/uploads/' . (int) $owner['id'] . '/' . $filename]);
}
