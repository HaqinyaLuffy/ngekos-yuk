const body = document.body;
const detailModal = document.querySelector('#detailModal');
const toast = document.querySelector('#toast');
const apiAlert = document.querySelector('#apiAlert');
const cityFilter = document.querySelector('#cityFilter');
const typeFilter = document.querySelector('#typeFilter');
const priceFilter = document.querySelector('#priceFilter');
const favoritesToggle = document.querySelector('#favoritesToggle');

const FAVORITES_KEY = 'ngekos_favorites';
const REVIEWS_PAGE_SIZE = 5;

let activeListing = null;
let currentUser = null;
let myReview = null;
let selectedRating = 0;
let listings = window.NGEKOS_LISTINGS || [];
let favorites = new Set();
let onlyFavorites = false;
let reviewState = { all: [], filter: 'all', shown: REVIEWS_PAGE_SIZE };
let toastTimer;

const formatRupiah = (number) => `Rp${new Intl.NumberFormat('id-ID').format(number)}`;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function openModal(modal) {
  modal.hidden = false;
  body.classList.add('modal-open');
}

function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  if (detailModal.hidden) body.classList.remove('modal-open');
}

function nextUrl() {
  return `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

// ---------- favorit ----------
// Pengunjung tanpa akun menyimpan favorit di browser; pengguna yang masuk menyimpannya di database
// (ikut ke perangkat mana pun). Favorit di browser digabung ke akun saat masuk.
function readLocalFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
  } catch (error) {
    return [];
  }
}

function writeLocalFavorites(ids) {
  try {
    if (ids.length) localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
    else localStorage.removeItem(FAVORITES_KEY);
  } catch (error) {
    console.warn('Favorit lokal tidak bisa disimpan', error);
  }
}

async function loadFavorites() {
  const local = readLocalFavorites();
  if (!currentUser) {
    favorites = new Set(local);
    return;
  }
  try {
    if (local.length) {
      await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingIds: local }) });
      writeLocalFavorites([]);
    }
    const response = await fetch('/api/favorites');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Favorit gagal dimuat.');
    favorites = new Set((data.ids || []).map(Number));
  } catch (error) {
    console.warn('Favorit akun tidak bisa dimuat', error);
    favorites = new Set(local);
  }
}

function updateFavoriteUI() {
  document.querySelectorAll('.favorite-button[data-fav-id]').forEach((button) => {
    const active = favorites.has(Number(button.dataset.favId));
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '♥' : '♡';
  });
  const count = listings.filter((listing) => favorites.has(Number(listing.id))).length;
  document.querySelector('#favCount').textContent = String(count);
  favoritesToggle.setAttribute('aria-pressed', String(onlyFavorites));
  favoritesToggle.firstChild.textContent = onlyFavorites ? '♥ Favorit ' : '♡ Favorit ';
}

async function toggleFavorite(id) {
  const listingId = Number(id);
  const wasFavorite = favorites.has(listingId);
  if (wasFavorite) favorites.delete(listingId);
  else favorites.add(listingId);
  updateFavoriteUI();
  filterListings();
  showToast(wasFavorite ? 'Dihapus dari favorit.' : 'Disimpan ke favoritmu.');

  if (!currentUser) {
    writeLocalFavorites([...favorites]);
    return;
  }
  try {
    const response = wasFavorite
      ? await fetch(`/api/favorites?listingId=${listingId}`, { method: 'DELETE' })
      : await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId }) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Favorit gagal disimpan.');
  } catch (error) {
    // Kembalikan tampilan ke keadaan semula jika server menolak.
    if (wasFavorite) favorites.add(listingId);
    else favorites.delete(listingId);
    updateFavoriteUI();
    filterListings();
    showToast(error.message);
  }
}

// ---------- detail kos ----------
function openDetail(listing, { scrollToReviews = false } = {}) {
  activeListing = listing;
  document.querySelector('#modalImage').src = listing.image;
  document.querySelector('#modalImage').alt = listing.name;
  document.querySelector('#modalTag').textContent = listing.tag;
  document.querySelector('#modalTitle').textContent = listing.name;
  const location = document.querySelector('#modalLocation');
  location.textContent = '';
  const pin = document.createElement('span');
  pin.textContent = '⌖';
  location.append(pin, ` ${listing.location}`);
  document.querySelector('#modalDescription').textContent = listing.description;
  document.querySelector('#modalPrice').textContent = formatRupiah(listing.price);
  document.querySelector('#modalFeatures').innerHTML = listing.features.map((feature) => `<span>${escapeHtml(feature)}</span>`).join('');
  document.querySelector('#modalFavorite').dataset.favId = listing.id;
  updateFavoriteUI();
  openModal(detailModal);
  const scroller = detailModal.querySelector('.detail-modal');
  scroller.scrollTop = 0;
  loadContact(listing);
  loadReviews(listing).then(() => {
    if (scrollToReviews && activeListing === listing) document.querySelector('#reviewsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadContact(listing) {
  const button = document.querySelector('#contactButton');
  button.hidden = false;
  button.removeAttribute('aria-disabled');
  if (!currentUser) {
    button.href = nextUrl();
    button.removeAttribute('target');
    button.innerHTML = 'Masuk untuk hubungi pemilik <span>→</span>';
    return;
  }
  button.removeAttribute('href');
  button.target = '_blank';
  button.setAttribute('aria-disabled', 'true');
  button.innerHTML = 'Memuat kontak...';
  try {
    const response = await fetch(`/api/listings?contact=${encodeURIComponent(listing.id)}`);
    const data = await response.json();
    if (activeListing !== listing) return;
    if (!response.ok || !data.url) throw new Error(data.error || 'Kontak tidak tersedia.');
    button.href = data.url;
    button.removeAttribute('aria-disabled');
    button.innerHTML = 'Chat WhatsApp <span>↗</span>';
  } catch (error) {
    if (activeListing !== listing) return;
    button.innerHTML = 'Kontak belum tersedia';
  }
}

// ---------- ulasan (publik, ala marketplace) ----------
function starsMarkup(value) {
  const full = Math.max(0, Math.min(5, Math.round(value)));
  return `${'★'.repeat(full)}<i>${'★'.repeat(5 - full)}</i>`;
}

function renderStars(container, value, interactive) {
  container.innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-button${n <= value ? ' on' : ''}" data-value="${n}" role="radio" aria-checked="${n === value}" aria-label="${n} bintang"${interactive ? '' : ' tabindex="-1"'}>★</button>`).join('');
}

function renderReviewSummary(summary) {
  const box = document.querySelector('#reviewSummary');
  if (!summary.count) { box.hidden = true; return; }
  box.hidden = false;
  document.querySelector('#reviewAverage').textContent = summary.average.toFixed(1);
  document.querySelector('#reviewAverageStars').innerHTML = starsMarkup(summary.average);
  document.querySelector('#reviewCount').textContent = `${summary.count} ulasan`;
  document.querySelector('#reviewBars').innerHTML = [5, 4, 3, 2, 1].map((star) => {
    const total = summary.distribution[star] || 0;
    const percent = Math.round((total / summary.count) * 100);
    return `<div class="review-bar"><span>${star} ★</span><div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div><small>${total}</small></div>`;
  }).join('');
}

function renderReviewFilters() {
  const box = document.querySelector('#reviewFilters');
  if (!reviewState.all.length) { box.hidden = true; return; }
  const chips = [{ key: 'all', label: 'Semua', total: reviewState.all.length }];
  [5, 4, 3, 2, 1].forEach((star) => chips.push({ key: String(star), label: `${star} ★`, total: reviewState.all.filter((review) => review.rating === star).length }));
  chips.push({ key: 'comment', label: 'Dengan komentar', total: reviewState.all.filter((review) => review.comment).length });
  box.innerHTML = chips.map((chip) => `<button type="button" class="chip${reviewState.filter === chip.key ? ' active' : ''}" data-filter="${chip.key}"${chip.total === 0 ? ' disabled' : ''}>${chip.label} (${chip.total})</button>`).join('');
  box.hidden = false;
}

function filteredReviews() {
  const { all, filter } = reviewState;
  if (filter === 'all') return all;
  if (filter === 'comment') return all.filter((review) => review.comment);
  return all.filter((review) => String(review.rating) === filter);
}

function renderReviewList() {
  const list = document.querySelector('#reviewList');
  const more = document.querySelector('#reviewMore');
  if (!reviewState.all.length) {
    list.innerHTML = '<p class="reviews-empty">Belum ada ulasan. Jadilah yang pertama memberi ulasan.</p>';
    more.hidden = true;
    return;
  }
  const items = filteredReviews();
  if (!items.length) {
    list.innerHTML = '<p class="reviews-empty">Belum ada ulasan untuk filter ini.</p>';
    more.hidden = true;
    return;
  }
  list.innerHTML = items.slice(0, reviewState.shown).map((review) => `
    <article class="review-item"><div class="review-avatar" aria-hidden="true">${escapeHtml(review.author.charAt(0).toUpperCase())}</div><div class="review-main"><div class="review-top"><strong>${escapeHtml(review.author)}${review.mine ? ' <em>(kamu)</em>' : ''}</strong><small>${new Date(review.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</small></div><span class="review-stars" aria-label="${review.rating} dari 5 bintang">${starsMarkup(review.rating)}</span>${review.comment ? `<p>${escapeHtml(review.comment)}</p>` : ''}</div></article>`).join('');
  more.hidden = items.length <= reviewState.shown;
}

async function loadReviews(listing) {
  const list = document.querySelector('#reviewList');
  const form = document.querySelector('#reviewForm');
  const loginNote = document.querySelector('#reviewLogin');
  list.innerHTML = '<p class="reviews-empty">Memuat ulasan...</p>';
  document.querySelector('#reviewSummary').hidden = true;
  document.querySelector('#reviewFilters').hidden = true;
  document.querySelector('#reviewMore').hidden = true;
  form.hidden = true;
  loginNote.hidden = true;
  myReview = null;
  try {
    const response = await fetch(`/api/reviews?listingId=${encodeURIComponent(listing.id)}`);
    const data = await response.json();
    if (activeListing !== listing) return;
    if (!response.ok) throw new Error(data.error || 'Ulasan gagal dimuat.');
    myReview = data.reviews.find((review) => review.mine) || null;
    reviewState = { all: data.reviews, filter: 'all', shown: REVIEWS_PAGE_SIZE };
    renderReviewSummary(data.summary);
    renderReviewFilters();
    renderReviewList();
    if (currentUser) {
      selectedRating = myReview ? myReview.rating : 0;
      renderStars(document.querySelector('#starInput'), selectedRating, true);
      document.querySelector('#reviewComment').value = myReview ? myReview.comment : '';
      document.querySelector('#reviewSubmit').textContent = myReview ? 'Perbarui ulasan' : 'Kirim ulasan';
      document.querySelector('#reviewDelete').hidden = !myReview;
      document.querySelector('#reviewError').hidden = true;
      form.hidden = false;
    } else {
      loginNote.innerHTML = `<a href="${nextUrl()}">Masuk</a> untuk menulis ulasan.`;
      loginNote.hidden = false;
    }
  } catch (error) {
    if (activeListing !== listing) return;
    list.innerHTML = `<p class="reviews-empty">${escapeHtml(error.message)}</p>`;
  }
}

// ---------- daftar kos ----------
async function refreshListings() {
  try {
    const response = await fetch('/api/listings');
    if (!response.ok) return;
    listings = await response.json();
    renderListings();
  } catch (error) {
    console.warn('Refresh listings skipped', error);
  }
}

function ratingBadge(listing) {
  if (!Number(listing.reviews)) return '<span class="rating rating-new">Baru</span>';
  return `<button class="rating rating-link" type="button" data-open-reviews="${listing.id}" aria-label="Lihat ${Number(listing.reviews)} ulasan"><span>★</span> ${Number(listing.rating).toFixed(1)} <small>(${Number(listing.reviews)})</small></button>`;
}

// Isi dropdown lokasi dari kota-kota yang benar-benar ada di data kos.
function populateCities() {
  const previous = cityFilter.value;
  const cities = [...new Set(listings.map((listing) => String(listing.city || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
  cityFilter.innerHTML = '<option value="all">Semua kota</option>' + cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join('');
  cityFilter.value = cities.includes(previous) ? previous : 'all';
}

function renderListings() {
  const grid = document.querySelector('#listingGrid');
  populateCities();
  grid.innerHTML = listings.map((listing) => `
    <article class="listing-card" data-id="${listing.id}" data-city="${escapeHtml(listing.city || '')}" data-type="${escapeHtml(listing.type)}" data-price="${Number(listing.price)}">
      <div class="listing-image-wrap"><img src="${escapeHtml(listing.image)}" alt="${escapeHtml(listing.name)}" loading="lazy"><span class="listing-tag">${escapeHtml(listing.tag)}</span><button class="favorite-button" type="button" data-fav-id="${listing.id}" aria-label="Simpan ${escapeHtml(listing.name)} ke favorit" aria-pressed="false">♡</button></div>
      <div class="listing-content"><div class="listing-title-row"><h3>${escapeHtml(listing.name)}</h3>${ratingBadge(listing)}</div><p class="listing-location"><span>⌖</span> ${escapeHtml(listing.location)}</p><div class="feature-list">${listing.features.map((feature) => `<span>${escapeHtml(feature)}</span>`).join('')}</div><div class="listing-footer"><div><strong>${formatRupiah(listing.price)}</strong><small>/${escapeHtml(listing.period)}</small></div><button class="detail-button" type="button" data-listing-id="${listing.id}">Lihat detail <span>→</span></button></div></div>
    </article>
  `).join('');
  updateFavoriteUI();
  filterListings();
}

function filterListings() {
  const city = cityFilter.value;
  const type = typeFilter.value;
  const priceText = priceFilter.value.trim();
  const maxPrice = priceText === '' || Number.isNaN(Number(priceText)) ? Infinity : Number(priceText);
  let visible = 0;

  document.querySelectorAll('.listing-card').forEach((card) => {
    const show = (city === 'all' || card.dataset.city === city)
      && (type === 'all' || card.dataset.type === type)
      && Number(card.dataset.price) <= maxPrice
      && (!onlyFavorites || favorites.has(Number(card.dataset.id)));
    card.hidden = !show;
    if (show) visible += 1;
  });

  document.querySelector('#resultCount').textContent = `${visible} kos ditemukan`;
  const empty = document.querySelector('#emptyState');
  empty.hidden = visible !== 0;
  if (visible === 0) {
    const noFavorites = onlyFavorites && favorites.size === 0;
    document.querySelector('#emptyTitle').textContent = noFavorites ? 'Belum ada kos favorit' : 'Belum ada kos yang cocok';
    document.querySelector('#emptyText').textContent = noFavorites ? 'Tekan ikon hati pada kos yang kamu suka untuk menyimpannya di sini.' : 'Coba pilih kota lain atau naikkan harga maksimal.';
  }
}

async function loadListings() {
  // Mode PHP lama (index.php) menyisipkan data lewat window.NGEKOS_LISTINGS.
  // Mode umum (Vercel & router.php) mengambilnya dari /api/listings.
  if (!Array.isArray(window.NGEKOS_LISTINGS)) {
    try {
      const response = await fetch('/api/listings');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Data kos gagal dimuat.');
      window.NGEKOS_LISTINGS = data;
    } catch (error) {
      console.error('Gagal memuat listings', error);
      if (apiAlert) {
        const detail = apiAlert.querySelector('span');
        if (detail) detail.textContent = error.message;
        apiAlert.hidden = false;
      }
      window.NGEKOS_LISTINGS = [];
    }
  }
  listings = window.NGEKOS_LISTINGS;
  renderListings();
}

async function loadSession() {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    if (data.user) {
      currentUser = data.user;
      const actions = document.querySelector('#authActions');
      actions.innerHTML = `<span class="user-greeting">Hai, ${escapeHtml(data.user.name)}</span><button class="outline-button" id="logoutButton" type="button">Keluar</button>`;
      document.querySelector('#logoutButton').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.reload();
      });
    }
  } catch (error) {
    console.warn('Session check skipped', error);
  }
}

// ---------- event ----------
document.querySelector('#listingGrid').addEventListener('click', (event) => {
  const favorite = event.target.closest('.favorite-button');
  if (favorite) { toggleFavorite(favorite.dataset.favId); return; }
  const reviewsLink = event.target.closest('[data-open-reviews]');
  if (reviewsLink) {
    const listing = listings.find((item) => String(item.id) === reviewsLink.dataset.openReviews);
    if (listing) openDetail(listing, { scrollToReviews: true });
    return;
  }
  const detail = event.target.closest('.detail-button');
  if (detail) {
    const listing = listings.find((item) => String(item.id) === detail.dataset.listingId);
    if (listing) openDetail(listing);
  }
});

document.querySelector('#modalFavorite').addEventListener('click', (event) => toggleFavorite(event.currentTarget.dataset.favId));

favoritesToggle.addEventListener('click', () => {
  onlyFavorites = !onlyFavorites;
  updateFavoriteUI();
  filterListings();
});

document.querySelectorAll('.modal-close').forEach((button) => button.addEventListener('click', () => closeModal(button.closest('.modal-backdrop'))));
document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(backdrop); }));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(detailModal); });

document.querySelector('#starInput').addEventListener('click', (event) => {
  const button = event.target.closest('.star-button');
  if (!button) return;
  selectedRating = Number(button.dataset.value);
  renderStars(document.querySelector('#starInput'), selectedRating, true);
});

document.querySelector('#reviewFilters').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip || chip.disabled) return;
  reviewState.filter = chip.dataset.filter;
  reviewState.shown = REVIEWS_PAGE_SIZE;
  renderReviewFilters();
  renderReviewList();
});

document.querySelector('#reviewMore').addEventListener('click', () => {
  reviewState.shown += REVIEWS_PAGE_SIZE;
  renderReviewList();
});

document.querySelector('#reviewForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorBox = document.querySelector('#reviewError');
  errorBox.hidden = true;
  if (!selectedRating) { errorBox.textContent = 'Pilih rating bintang terlebih dahulu.'; errorBox.hidden = false; return; }
  const listing = activeListing;
  try {
    const response = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: listing.id, rating: selectedRating, comment: document.querySelector('#reviewComment').value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ulasan gagal dikirim.');
    showToast('Ulasanmu tersimpan.');
    await loadReviews(listing);
    refreshListings();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
});

document.querySelector('#reviewDelete').addEventListener('click', async () => {
  if (!myReview || !confirm('Hapus ulasanmu?')) return;
  const listing = activeListing;
  const response = await fetch(`/api/reviews?id=${myReview.id}`, { method: 'DELETE' });
  if (response.ok) {
    showToast('Ulasan dihapus.');
    await loadReviews(listing);
    refreshListings();
  }
});

const menuToggle = document.querySelector('.menu-toggle');
menuToggle.addEventListener('click', () => {
  const isOpen = document.querySelector('.site-header').classList.toggle('menu-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

[cityFilter, typeFilter].forEach((field) => field.addEventListener('change', filterListings));
priceFilter.addEventListener('input', filterListings);
document.querySelector('#searchButton').addEventListener('click', () => { filterListings(); document.querySelector('#listings').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
document.querySelector('#resetFilters').addEventListener('click', () => {
  cityFilter.value = 'all';
  typeFilter.value = 'all';
  priceFilter.value = '';
  onlyFavorites = false;
  updateFavoriteUI();
  filterListings();
});

let sortAscending = false;
document.querySelector('#sortButton').addEventListener('click', () => {
  sortAscending = !sortAscending;
  listings.sort((a, b) => sortAscending ? a.price - b.price : b.price - a.price);
  renderListings();
  showToast(sortAscending ? 'Diurutkan dari harga termurah.' : 'Diurutkan dari harga termahal.');
});

// Urutan penting: sesi dulu (menentukan sumber favorit), lalu favorit, baru daftar kos.
(async function init() {
  await loadSession();
  await loadFavorites();
  await loadListings();
})();
