<?php
declare(strict_types=1);

// Pengendali tunggal untuk semua permintaan /api/* (lihat .htaccess).
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/handlers.php';

guardOrigin();

$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$path = rtrim((string) preg_replace('#^/api#', '', $path), '/');

$routes = [
    '/listings'        => 'h_listings',
    '/reviews'         => 'h_reviews',
    '/favorites'       => 'h_favorites',
    '/auth/login'      => 'h_auth_login',
    '/auth/register'   => 'h_auth_register',
    '/auth/logout'     => 'h_auth_logout',
    '/auth/me'         => 'h_auth_me',
    '/owner/auth'      => 'h_owner_auth',
    '/owner/listings'  => 'h_owner_listings',
    '/owner/upload'    => 'h_owner_upload',
];

if (!isset($routes[$path])) {
    fail(404, 'Endpoint tidak ditemukan.');
}

$routes[$path]();
