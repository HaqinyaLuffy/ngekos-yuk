const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const rupiah = (n) => `Rp${new Intl.NumberFormat('id-ID').format(n)}`;
const toast = $('#toast');
let owner = null;
let myListings = [];
let editingId = null;
let imageUrl = '';
let uploading = false;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { window.location.replace('/owner/login'); throw new Error('Sesi berakhir.'); }
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
  return data;
}

function renderStats() {
  const active = myListings.filter((l) => l.is_active).length;
  $('#dashStats').innerHTML = `
    <div><strong>${myListings.length}</strong><span>Total kos</span></div>
    <div><strong>${active}</strong><span>Iklan aktif</span></div>
    <div><strong>${myListings.reduce((sum, l) => sum + Number(l.reviews || 0), 0)}</strong><span>Total ulasan</span></div>`;
}

function renderListings() {
  const box = $('#tab-listings');
  if (!myListings.length) {
    box.innerHTML = '<div class="empty-state dash-empty"><span>⌂</span><h3>Belum ada kos</h3><p>Pasang kos pertamamu agar calon penghuni bisa menemukan dan menghubungimu.</p></div>';
    return;
  }
  box.innerHTML = myListings.map((l) => `
    <article class="dash-row" data-id="${l.id}">
      <img src="${escapeHtml(l.image)}" alt="" loading="lazy">
      <div class="dash-row-info">
        <div class="dash-row-title"><h3>${escapeHtml(l.name)}</h3><span class="badge ${l.is_active ? 'on' : 'off'}">${l.is_active ? 'Aktif' : 'Nonaktif'}</span></div>
        <p>${escapeHtml(l.location)} · ${escapeHtml(l.type)}</p>
        <p><strong>${rupiah(l.price)}</strong>/bulan · ${l.reviews ? `★ ${Number(l.rating).toFixed(1)} (${l.reviews} ulasan)` : 'Belum ada ulasan'} · WA ${escapeHtml(l.contact_phone || '-')}</p>
      </div>
      <div class="dash-row-actions"><button class="outline-button" data-action="edit" type="button">Ubah</button><button class="outline-button" data-action="toggle" type="button">${l.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="outline-button danger" data-action="delete" type="button">Hapus</button></div>
    </article>`).join('');
}

async function renderReviews() {
  const box = $('#tab-reviews');
  const withReviews = myListings.filter((l) => l.reviews > 0);
  if (!withReviews.length) { box.innerHTML = '<div class="empty-state dash-empty"><span>★</span><h3>Belum ada ulasan</h3><p>Ulasan penghuni untuk kosmu akan tampil di sini.</p></div>'; return; }
  box.innerHTML = '<p class="reviews-empty">Memuat ulasan...</p>';
  const results = await Promise.all(withReviews.map((l) => fetch(`/api/reviews?listingId=${l.id}`).then((r) => r.json()).then((d) => ({ listing: l, reviews: d.reviews || [] })).catch(() => ({ listing: l, reviews: [] }))));
  box.innerHTML = results.map(({ listing, reviews }) => `
    <div class="dash-group"><h3>${escapeHtml(listing.name)} <small>★ ${Number(listing.rating).toFixed(1)} · ${listing.reviews} ulasan</small></h3>
    ${reviews.map((r) => `<article class="review-item"><div class="review-top"><strong>${escapeHtml(r.author)}</strong><span class="review-stars">${'★'.repeat(r.rating)}<i>${'★'.repeat(5 - r.rating)}</i></span></div>${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}<small>${new Date(r.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</small></article>`).join('')}</div>`).join('');
}

async function loadAll() {
  myListings = await api('/api/owner/listings');
  renderStats();
  renderListings();
  if (!$('#tab-reviews').hidden) renderReviews();
}

// ---------- tab ----------
document.querySelectorAll('.dash-tabs button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.dash-tabs button').forEach((b) => b.classList.toggle('active', b === button));
  ['listings', 'reviews'].forEach((name) => { $(`#tab-${name}`).hidden = name !== button.dataset.tab; });
  if (button.dataset.tab === 'reviews') renderReviews();
}));

// ---------- modal form ----------
const modal = $('#listingModal');
const form = $('#listingForm');

function openForm(listing) {
  editingId = listing ? listing.id : null;
  form.reset();
  $('#listingError').hidden = true;
  $('#listingModalTitle').textContent = listing ? 'Ubah kos' : 'Pasang kos baru';
  imageUrl = listing ? listing.image : '';
  form.elements.contactPhone.value = listing ? listing.contact_phone : owner.whatsapp;
  if (listing) {
    form.elements.name.value = listing.name;
    form.elements.location.value = listing.location;
    form.elements.city.value = listing.city;
    form.elements.type.value = listing.type;
    form.elements.price.value = listing.price;
    form.elements.tag.value = listing.tag === 'Baru' ? '' : listing.tag;
    form.elements.features.value = (listing.features || []).join(', ');
    form.elements.description.value = listing.description;
    form.elements.isActive.checked = listing.is_active;
  }
  $('#imagePreview').hidden = !imageUrl;
  if (imageUrl) { $('#imagePreview img').src = imageUrl; $('#imageStatus').textContent = 'Foto saat ini'; }
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeForm() { modal.hidden = true; document.body.classList.remove('modal-open'); }
modal.querySelector('.modal-close').addEventListener('click', closeForm);
modal.addEventListener('click', (event) => { if (event.target === modal) closeForm(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeForm(); });
$('#newListing').addEventListener('click', () => openForm(null));

// Perkecil gambar di browser (maks 1600px, JPEG) agar upload ringan.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Gambar gagal diproses.'));
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, blob });
        reader.onerror = () => reject(new Error('Gambar gagal dibaca.'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File bukan gambar yang valid.')); };
    img.src = url;
  });
}

$('#imageFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const status = $('#imageStatus');
  $('#imagePreview').hidden = false;
  status.textContent = 'Mengunggah...';
  uploading = true;
  try {
    const { dataUrl } = await compressImage(file);
    $('#imagePreview img').src = dataUrl;
    const data = await api('/api/owner/upload', { method: 'POST', body: JSON.stringify({ data: dataUrl }) });
    imageUrl = data.url;
    status.textContent = 'Foto terunggah ✓';
  } catch (error) {
    status.textContent = error.message;
    imageUrl = '';
  } finally {
    uploading = false;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorBox = $('#listingError');
  errorBox.hidden = true;
  if (uploading) { errorBox.textContent = 'Tunggu sampai foto selesai diunggah.'; errorBox.hidden = false; return; }
  if (!imageUrl) { errorBox.textContent = 'Foto kos wajib diunggah.'; errorBox.hidden = false; return; }
  const values = Object.fromEntries(new FormData(form));
  const payload = { ...values, image: imageUrl, isActive: form.elements.isActive.checked };
  try {
    await api(editingId ? `/api/owner/listings?id=${editingId}` : '/api/owner/listings', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    closeForm();
    showToast(editingId ? 'Kos diperbarui.' : 'Kos berhasil dipasang.');
    await loadAll();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});

$('#tab-listings').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const listing = myListings.find((l) => String(l.id) === button.closest('.dash-row').dataset.id);
  if (!listing) return;
  try {
    if (button.dataset.action === 'edit') return openForm(listing);
    if (button.dataset.action === 'toggle') {
      await api(`/api/owner/listings?id=${listing.id}`, { method: 'PUT', body: JSON.stringify({ ...listing, image: listing.image, contactPhone: listing.contact_phone, isActive: !listing.is_active }) });
      showToast(listing.is_active ? 'Iklan dinonaktifkan.' : 'Iklan diaktifkan.');
    }
    if (button.dataset.action === 'delete') {
      if (!confirm(`Hapus "${listing.name}" beserta ulasannya? Tindakan ini tidak bisa dibatalkan.`)) return;
      await api(`/api/owner/listings?id=${listing.id}`, { method: 'DELETE' });
      showToast('Kos dihapus.');
    }
    await loadAll();
  } catch (error) {
    showToast(error.message);
  }
});

$('#ownerLogout').addEventListener('click', async () => {
  await fetch('/api/owner/auth?action=logout', { method: 'POST' });
  window.location.href = '/owner/login';
});

(async function init() {
  try {
    const data = await fetch('/api/owner/auth?action=me').then((r) => r.json());
    if (!data.owner) return window.location.replace('/owner/login');
    owner = data.owner;
    $('#ownerName').textContent = `Hai, ${owner.name}`;
    await loadAll();
  } catch (error) {
    $('#tab-listings').innerHTML = `<p class="form-error">${escapeHtml(error.message || 'Gagal memuat dashboard.')}</p>`;
  }
})();
