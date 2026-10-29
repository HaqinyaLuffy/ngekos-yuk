// Rewrite Vercel tidak mengubah URL di browser, jadi mode ditentukan dari path (dengan ?mode= sebagai cadangan).
const mode = /register/.test(window.location.pathname) || new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login';
const form = document.querySelector('#authForm');
const errorBox = document.querySelector('#authError');
const isRegister = mode === 'register';

document.title = `Ngekos — ${isRegister ? 'Daftar' : 'Masuk'} Pemilik Kos`;
document.querySelector('#authKicker').textContent = isRegister ? 'Untuk pemilik kos' : 'Area pemilik kos';
document.querySelector('#authHero').innerHTML = isRegister ? 'Pasang kosmu,<br><em>temukan penghuni.</em>' : 'Kelola kosmu<br><em>dengan mudah.</em>';
document.querySelector('#authDescription').textContent = isRegister
  ? 'Daftar sebagai pemilik, pasang iklan kos, dan biarkan calon penghuni menghubungimu langsung lewat WhatsApp.'
  : 'Masuk untuk memasang iklan, melihat permintaan masuk, dan membaca ulasan penghuni.';
document.querySelector('#authTitle').textContent = isRegister ? 'Daftar pemilik kos' : 'Masuk pemilik kos';
document.querySelector('#authIntro').textContent = isRegister ? 'Nomor WhatsApp akan ditampilkan kepada pencari kos yang sudah login.' : 'Gunakan email dan password akun pemilik kos.';
document.querySelector('#loginTab').classList.toggle('active', !isRegister);
document.querySelector('#registerTab').classList.toggle('active', isRegister);
document.querySelector('#authBottom').innerHTML = isRegister
  ? 'Sudah punya akun pemilik? <a href="/owner/login">Masuk</a> · Mencari kos? <a href="/login">Masuk sebagai pencari kos</a>'
  : 'Belum punya akun pemilik? <a href="/owner/register">Daftar</a> · Mencari kos? <a href="/login">Masuk sebagai pencari kos</a>';

form.innerHTML = isRegister ? `
  <label>Nama lengkap<input name="name" type="text" placeholder="Contoh: Bu Ratna" autocomplete="name" required></label>
  <label>Email<input name="email" type="email" placeholder="nama@email.com" autocomplete="email" required></label>
  <label>Nomor WhatsApp<input name="whatsapp" type="tel" placeholder="08xx xxxx xxxx" autocomplete="tel" required></label>
  <label>Password<input name="password" type="password" placeholder="Minimal 8 karakter" minlength="8" autocomplete="new-password" required></label>
  <label>Ulangi password<input name="passwordConfirmation" type="password" placeholder="Ketik ulang password" minlength="8" autocomplete="new-password" required></label>
  <button class="primary-button" type="submit">Buat akun pemilik <span>→</span></button>
` : `
  <label>Email<input name="email" type="email" placeholder="nama@email.com" autocomplete="email" required></label>
  <label>Password<input name="password" type="password" placeholder="Password akun pemilik" autocomplete="current-password" required></label>
  <button class="primary-button" type="submit">Masuk <span>→</span></button>
`;

// Pemilik yang sudah login langsung diarahkan ke dashboard.
fetch('/api/owner/auth?action=me').then((response) => response.json()).then((data) => {
  if (data.owner) window.location.replace('/owner/dashboard');
}).catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  try {
    const response = await fetch(`/api/owner/auth?action=${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
    window.location.href = '/owner/dashboard';
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});
