// Rewrite Vercel tidak mengubah URL di browser, jadi mode ditentukan dari path (dengan ?mode= sebagai cadangan).
const mode = /register/.test(window.location.pathname) || new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login';
const form = document.querySelector('#authForm');
const errorBox = document.querySelector('#authError');
const submitLabel = mode === 'register' ? 'Buat akun' : 'Masuk';

document.querySelector('#authKicker').textContent = mode === 'register' ? 'Mulai perjalananmu' : 'Selamat datang kembali';
document.querySelector('#authHero').innerHTML = mode === 'register' ? 'Buat ruang untuk<br><em>cerita baru.</em>' : 'Masuk dan<br><em>lanjutkan carimu.</em>';
document.querySelector('#authDescription').textContent = mode === 'register'
  ? 'Daftar gratis untuk menyimpan kos favorit dan menghubungi pemilik dengan mudah.'
  : 'Temukan kos yang terasa seperti rumah dan simpan semua pilihan favoritmu.';
document.querySelector('#authNoteIcon').textContent = mode === 'register' ? '♡' : '✦';
document.querySelector('#authNote').textContent = mode === 'register' ? 'Lebih dekat dengan tempat pulangmu.' : 'Ruang nyaman untuk cerita baru.';
document.querySelector('#authTitle').textContent = mode === 'register' ? 'Buat akun baru' : 'Masuk ke akunmu';
document.querySelector('#authIntro').textContent = mode === 'register' ? 'Isi data di bawah ini untuk mulai mencari kos.' : 'Gunakan email dan password yang sudah terdaftar.';
document.querySelector('#loginTab').classList.toggle('active', mode === 'login');
document.querySelector('#registerTab').classList.toggle('active', mode === 'register');
document.querySelector('#authBottom').innerHTML = mode === 'register'
  ? 'Sudah punya akun? <a href="/login">Masuk sekarang</a>'
  : 'Belum punya akun? <a href="/register">Daftar sekarang</a>';

form.innerHTML = mode === 'register' ? `
  <label>Nama lengkap<input name="name" type="text" placeholder="Contoh: Alya Putri" autocomplete="name" required></label>
  <label>Email<input name="email" type="email" placeholder="nama@email.com" autocomplete="email" required></label>
  <label>Password<input name="password" type="password" placeholder="Minimal 8 karakter" minlength="8" autocomplete="new-password" required></label>
  <label>Ulangi password<input name="passwordConfirmation" type="password" placeholder="Ketik ulang password" minlength="8" autocomplete="new-password" required></label>
  <button class="primary-button" type="submit">${submitLabel} <span>→</span></button>
` : `
  <label>Email<input name="email" type="email" placeholder="nama@email.com" autocomplete="email" required></label>
  <label>Password<input name="password" type="password" placeholder="Minimal 8 karakter" autocomplete="current-password" required></label>
  <button class="primary-button" type="submit">${submitLabel} <span>→</span></button>
`;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  errorBox.hidden = true;
  const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
    const next = new URLSearchParams(window.location.search).get('next') || '';
    window.location.href = /^\/(?![\/\\])/.test(next) ? next : '/';
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});
