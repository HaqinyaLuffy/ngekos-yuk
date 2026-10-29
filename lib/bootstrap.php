<?php
declare(strict_types=1);

// Infrastruktur bersama: konfigurasi, database, sesi, dan respons JSON.
// Kompatibel dengan PHP 7.4 ke atas.

date_default_timezone_set('UTC');

const SESSION_TTL = 604800; // 7 hari, sama seperti versi Vercel
const DUMMY_HASH = '$2y$10$dfJ892tGLbu3Pb7.N9LnG.a0.COScjrRQNDs6ZtrqHT/cXOJM8XWe';

function cfg(string $key, $default = null)
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/../config/config.php';
    }
    return $config[$key] ?? $default;
}

function method(): string
{
    return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

function isHttps(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    if (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') {
        return true;
    }
    if (strpos((string) ($_SERVER['HTTP_CF_VISITOR'] ?? ''), 'https') !== false) {
        return true;
    }
    return (string) ($_SERVER['SERVER_PORT'] ?? '') === '443';
}

function respond(int $status, $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message): void
{
    respond($status, ['error' => $message]);
}

function requireMethod(string ...$allowed): void
{
    if (!in_array(method(), $allowed, true)) {
        fail(405, 'Method tidak diizinkan.');
    }
}

function jsonBody(): array
{
    static $body = null;
    if ($body === null) {
        $decoded = json_decode((string) file_get_contents('php://input'), true);
        $body = is_array($decoded) ? $decoded : [];
    }
    return $body;
}

// Tolak permintaan tulis lintas-situs (lapisan tambahan di samping cookie SameSite=Lax).
function guardOrigin(): void
{
    if (in_array(method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') {
        return;
    }
    $host = (string) parse_url($origin, PHP_URL_HOST);
    $port = parse_url($origin, PHP_URL_PORT);
    $originHost = $host . ($port ? ':' . $port : '');
    if (strcasecmp($originHost, (string) ($_SERVER['HTTP_HOST'] ?? '')) !== 0) {
        fail(403, 'Permintaan ditolak.');
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        cfg('db_host'),
        (int) cfg('db_port', 3306),
        cfg('db_name')
    );
    $pdo = new PDO($dsn, (string) cfg('db_user'), (string) cfg('db_pass'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function iso(?string $mysqlDate): ?string
{
    if ($mysqlDate === null || $mysqlDate === '') {
        return null;
    }
    $ts = strtotime($mysqlDate . ' UTC');
    return $ts === false ? null : gmdate('Y-m-d\TH:i:s\Z', $ts);
}

// ---------- Sesi: dua sesi terpisah ("user" = pencari kos, "owner" = pemilik kos) ----------

const SESSION_NAME = 'ngekos_session';

function startSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string) SESSION_TTL);
    session_name(SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => SESSION_TTL,
        'path' => '/',
        'secure' => isHttps(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function readSession(string $kind = 'user'): ?array
{
    // Tanpa cookie sesi, tidak perlu membuka/membuat sesi baru.
    if (!isset($_COOKIE[SESSION_NAME])) {
        return null;
    }
    startSession();
    $entry = $_SESSION[$kind] ?? null;
    if (!is_array($entry) || (int) ($entry['exp'] ?? 0) < time() || !is_array($entry['data'] ?? null)) {
        return null;
    }
    return $entry['data'];
}

function setSession(array $data, string $kind = 'user'): void
{
    startSession();
    session_regenerate_id(true);
    $_SESSION[$kind] = ['data' => $data, 'exp' => time() + SESSION_TTL];
}

function clearSession(string $kind = 'user'): void
{
    if (!isset($_COOKIE[SESSION_NAME])) {
        return;
    }
    startSession();
    unset($_SESSION[$kind]);
}

// Mengembalikan sesi, atau membalas 401 dan berhenti.
function requireSession(string $kind): array
{
    $session = readSession($kind);
    if ($session === null) {
        fail(401, $kind === 'owner' ? 'Masuk sebagai pemilik kos terlebih dahulu.' : 'Masuk terlebih dahulu.');
    }
    return $session;
}

// ---------- Utilitas ----------

// Normalisasi nomor WhatsApp Indonesia ke 62xxxxxxxxxx. null jika tidak valid.
function normalizePhone($input): ?string
{
    $digits = preg_replace('/\D/', '', (string) $input);
    if ($digits === '' || $digits === null) {
        return null;
    }
    if ($digits[0] === '0') {
        $digits = '62' . substr($digits, 1);
    } elseif ($digits[0] === '8') {
        $digits = '62' . $digits;
    }
    return preg_match('/^628\d{8,12}$/', $digits) ? $digits : null;
}

// Mengubah nilai JSON (angka atau string angka bulat) menjadi int, atau null jika tidak valid.
function toInt($value): ?int
{
    if (is_int($value)) {
        return $value;
    }
    if (is_float($value) && floor($value) === $value) {
        return (int) $value;
    }
    if (is_string($value) && preg_match('/^-?\d+$/', trim($value))) {
        return (int) trim($value);
    }
    return null;
}

function textLen(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

function textSub(string $s, int $start, ?int $length = null): string
{
    return function_exists('mb_substr') ? mb_substr($s, $start, $length, 'UTF-8') : substr($s, $start, $length);
}

set_exception_handler(function (Throwable $e): void {
    error_log('Ngekos error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $payload = ['error' => 'Terjadi kesalahan pada server. Periksa konfigurasi database (lihat README).'];
    if (cfg('debug', false)) {
        $payload['debug'] = $e->getMessage();
    }
    respond(500, $payload);
});
