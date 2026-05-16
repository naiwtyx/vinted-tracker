// ── Config Supabase ───────────────────────────────────────
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsb2p3emFzd2FvcmFkY3hlcW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjMzNjcsImV4cCI6MjA5NDQ5OTM2N30.1DC5oDCa8667Nfjc9YL-xy7ZNvVgaE2dWFv4bKyp_GQ';
const API          = 'https://glojwzaswaoradcxeqmx.supabase.co/rest/v1/articles';
const STORAGE_BASE = 'https://glojwzaswaoradcxeqmx.supabase.co/storage/v1/object';
const BUCKET       = 'articles-photos';

const HEADERS = {
  'apikey':        SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type':  'application/json',
};

// ── Constantes ────────────────────────────────────────────
const FEE_RATE = 0.05;
const FEE_FIXED = 0.70;

// ── Paramètres utilisateur ────────────────────────────────
let stockThreshold = parseInt(localStorage.getItem('stock_threshold') || '30');

// ── État global ───────────────────────────────────────────
let allArticles    = [];
let currentFilter  = 'tous';
let deleteTargetId = null;
let deletePhotoUrl = null;
let chartInstance  = null;
let currentPhotoFile = null;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  loadAll();

  // Header
  document.getElementById('btn-add').addEventListener('click', openAddModal);
  document.getElementById('btn-calc').addEventListener('click', () => {
    document.getElementById('calc-achat').value = '';
    document.getElementById('calc-marge').value = '';
    document.getElementById('calc-result').style.display = 'none';
    showModal('calc-modal', true);
  });
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-settings').addEventListener('click', openSettings);

  // Modal article
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('form-cancel').addEventListener('click', closeModal);
  document.getElementById('article-form').addEventListener('submit', submitForm);
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeModal();
  });

  // Statut → affiche/masque date de vente
  document.getElementById('statut').addEventListener('change', e => {
    document.getElementById('date-vente-group').style.opacity =
      e.target.value === 'vendu' ? '1' : '0.4';
  });

  // Preview calcul
  ['prix_achat', 'prix_vente', 'frais_vinted'].forEach(id =>
    document.getElementById(id).addEventListener('input', updatePreview)
  );

  // Photo upload
  const uploadArea = document.getElementById('photo-upload-area');
  uploadArea.addEventListener('click', () => document.getElementById('photo-input').click());
  document.getElementById('photo-input').addEventListener('change', onPhotoSelected);

  // Calculateur
  document.getElementById('calc-close').addEventListener('click', () => showModal('calc-modal', false));
  document.getElementById('calc-achat').addEventListener('input', updateCalculator);
  document.getElementById('calc-marge').addEventListener('input', updateCalculator);

  // Paramètres
  document.getElementById('settings-close').addEventListener('click', () => showModal('settings-modal', false));
  document.getElementById('settings-save').addEventListener('click', saveSettings);

  // Suppression
  document.getElementById('confirm-cancel').addEventListener('click', () => showModal('confirm-modal', false));
  document.getElementById('confirm-ok').addEventListener('click', confirmDelete);

  // Filtres
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderArticles();
    });
  });
});

// ── Service Worker ────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ── API Supabase ──────────────────────────────────────────
async function loadAll() {
  try {
    const res = await fetch(`${API}?order=created_at.desc`, { headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    allArticles = data.map(computeArticle);
    renderStats(computeStats(allArticles));
    renderArticles();
    renderChart(allArticles);
  } catch (e) {
    showToast('Erreur de connexion à Supabase', 'error');
    console.error(e);
  }
}

async function submitForm(e) {
  e.preventDefault();
  const id       = document.getElementById('article-id').value;
  const fraisRaw = document.getElementById('frais_vinted').value;
  const statut   = document.getElementById('statut').value;

  let photo_url = document.getElementById('article-photo-url').value || null;

  // Upload photo si nouvelle sélection
  if (currentPhotoFile) {
    try {
      photo_url = await uploadPhoto(currentPhotoFile);
    } catch {
      showToast('Erreur upload photo', 'error');
      return;
    }
  }

  const payload = {
    nom:          document.getElementById('nom').value.trim(),
    categorie:    document.getElementById('categorie').value,
    prix_achat:   parseFloat(document.getElementById('prix_achat').value),
    prix_vente:   parseFloat(document.getElementById('prix_vente').value),
    frais_vinted: fraisRaw ? parseFloat(fraisRaw) : null,
    statut,
    date_achat:   document.getElementById('date_achat').value || null,
    date_vente:   statut === 'vendu' ? (document.getElementById('date_vente').value || null) : null,
    photo_url,
  };

  try {
    const res = id
      ? await fetch(`${API}?id=eq.${id}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(payload) })
      : await fetch(API,                   { method: 'POST',  headers: HEADERS, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(await res.text());
    closeModal();
    await loadAll();
    showToast(id ? 'Article modifié ✓' : 'Article ajouté ✓');
  } catch (err) {
    showToast('Erreur lors de l\'enregistrement', 'error');
    console.error(err);
  }
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  try {
    const res = await fetch(`${API}?id=eq.${deleteTargetId}`, { method: 'DELETE', headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    if (deletePhotoUrl) await deletePhoto(deletePhotoUrl);
    showModal('confirm-modal', false);
    deleteTargetId = null;
    deletePhotoUrl = null;
    await loadAll();
    showToast('Article supprimé');
  } catch (err) {
    showToast('Erreur lors de la suppression', 'error');
    console.error(err);
  }
}

// ── Storage photo ─────────────────────────────────────────
async function uploadPhoto(file) {
  const ext      = file.name.split('.').pop();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const res = await fetch(`${STORAGE_BASE}/${BUCKET}/${filename}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  file.type,
      'x-upsert':      'true',
    },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
  return `${STORAGE_BASE}/public/${BUCKET}/${filename}`;
}

async function deletePhoto(url) {
  const parts = url.split(`/public/${BUCKET}/`);
  if (parts.length < 2) return;
  await fetch(`${STORAGE_BASE}/${BUCKET}`, {
    method: 'DELETE',
    headers: HEADERS,
    body: JSON.stringify({ prefixes: [parts[1]] }),
  });
}

// ── Calculs ───────────────────────────────────────────────
function computeArticle(a) {
  const frais       = a.frais_vinted != null
    ? +a.frais_vinted
    : +(a.prix_vente * FEE_RATE + FEE_FIXED).toFixed(2);
  const benefice_net = +(a.prix_vente - a.prix_achat - frais).toFixed(2);
  const marge        = a.prix_achat
    ? +((benefice_net / a.prix_achat) * 100).toFixed(1) : 0;
  const days_in_stock = getDaysInStock(a);
  return { ...a, frais_vinted: frais, benefice_net, marge, days_in_stock };
}

function getDaysInStock(a) {
  if (a.statut !== 'en stock' || !a.date_achat) return null;
  return Math.floor((Date.now() - new Date(a.date_achat)) / 86400000);
}

function computeStats(articles) {
  const vendus    = articles.filter(a => a.statut === 'vendu');
  const en_stock  = articles.filter(a => a.statut === 'en stock');

  // Temps moyen de vente
  const durees = vendus
    .filter(a => a.date_achat && a.date_vente)
    .map(a => Math.round((new Date(a.date_vente) - new Date(a.date_achat)) / 86400000));
  const temps_moyen = durees.length
    ? Math.round(durees.reduce((s, d) => s + d, 0) / durees.length) : null;

  // Meilleure catégorie (parmi vendus)
  const byCat = {};
  vendus.forEach(a => {
    if (!byCat[a.categorie]) byCat[a.categorie] = [];
    byCat[a.categorie].push(a.marge);
  });
  const bestCat = Object.entries(byCat)
    .map(([cat, marges]) => ({ cat, avg: marges.reduce((s, m) => s + m, 0) / marges.length }))
    .sort((a, b) => b.avg - a.avg)[0] || null;

  return {
    benefice_total:    +vendus.reduce((s, a) => s + a.benefice_net, 0).toFixed(2),
    marge_moyenne:     vendus.length
      ? +(vendus.reduce((s, a) => s + a.marge, 0) / vendus.length).toFixed(1) : 0,
    nb_vendus:         vendus.length,
    capital_immobilise: +en_stock.reduce((s, a) => s + a.prix_achat, 0).toFixed(2),
    temps_moyen,
    best_cat: bestCat,
  };
}

// ── Render stats ──────────────────────────────────────────
function renderStats(s) {
  const bEl = document.getElementById('stat-benefice');
  bEl.textContent = fmt(s.benefice_total) + ' €';
  bEl.className   = 'stat-value ' + (s.benefice_total >= 0 ? 'green' : 'red');

  document.getElementById('stat-marge').textContent     = s.marge_moyenne + ' %';
  document.getElementById('stat-vendus').textContent    = s.nb_vendus;
  document.getElementById('stat-capital').textContent   = fmt(s.capital_immobilise) + ' €';
  document.getElementById('stat-temps').textContent     =
    s.temps_moyen != null ? s.temps_moyen + ' j' : '—';
  document.getElementById('stat-categorie').textContent =
    s.best_cat ? `${s.best_cat.cat} (${s.best_cat.avg.toFixed(0)}%)` : '—';
}

// ── Render articles ───────────────────────────────────────
function renderArticles() {
  const list     = document.getElementById('article-list');
  const empty    = document.getElementById('empty-state');
  const filtered = currentFilter === 'tous'
    ? allArticles
    : allArticles.filter(a => a.statut === currentFilter);

  list.querySelectorAll('.article-card').forEach(el => el.remove());

  if (filtered.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  filtered.forEach(a => list.appendChild(buildCard(a)));
}

function buildCard(a) {
  const isWarning = a.days_in_stock != null && a.days_in_stock > stockThreshold;
  const card = document.createElement('div');
  card.className = `article-card${a.statut === 'vendu' ? ' vendu' : ''}`;

  const photoHtml = a.photo_url
    ? `<img class="card-photo" src="${esc(a.photo_url)}" alt="${esc(a.nom)}" loading="lazy" />`
    : '';

  const warningHtml = isWarning
    ? `<span class="badge-warning">⚠️ ${a.days_in_stock}j en stock</span>` : '';

  const dateHtml = a.statut === 'en stock' && a.date_achat
    ? `<span class="card-date">Acheté le ${fmtDate(a.date_achat)}</span>`
    : a.statut === 'vendu' && a.date_vente
      ? `<span class="card-date">Vendu le ${fmtDate(a.date_vente)}</span>` : '';

  card.innerHTML = `
    ${photoHtml}
    <div class="card-body">
      <div class="card-top">
        <div class="card-nom-wrap">
          <span class="card-nom">${esc(a.nom)}</span>
          <div class="card-meta">
            <span class="cat-badge cat-${esc(a.categorie || 'Autre')}">${esc(a.categorie || 'Autre')}</span>
            ${warningHtml}
            ${dateHtml}
          </div>
        </div>
        <span class="badge ${a.statut === 'vendu' ? 'badge-vendu' : 'badge-stock'}">
          ${a.statut === 'vendu' ? '✓ Vendu' : '📦 En stock'}
        </span>
      </div>
      <div class="card-prices">
        <div class="price-item">
          <span class="price-label">Achat</span>
          <span class="price-val muted">${fmt(a.prix_achat)} €</span>
        </div>
        <div class="price-item">
          <span class="price-label">Vente</span>
          <span class="price-val">${fmt(a.prix_vente)} €</span>
        </div>
        <div class="price-item">
          <span class="price-label">Bénéfice</span>
          <span class="price-val ${a.benefice_net >= 0 ? 'green' : 'red'}">${fmt(a.benefice_net)} €</span>
        </div>
        <div class="price-item">
          <span class="price-label">Marge</span>
          <span class="price-val ${a.marge >= 0 ? 'green' : 'red'}">${a.marge} %</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-icon edit"   data-id="${a.id}">✏️ Modifier</button>
        <button class="btn-icon delete" data-id="${a.id}">🗑️ Supprimer</button>
      </div>
    </div>
  `;
  card.querySelector('.edit').addEventListener('click',   () => openEditModal(a));
  card.querySelector('.delete').addEventListener('click', () => askDelete(a));
  return card;
}

// ── Chart ─────────────────────────────────────────────────
function renderChart(articles) {
  const vendus = articles.filter(a => a.statut === 'vendu' && a.date_vente);
  const byMonth = {};
  vendus.forEach(a => {
    const key = a.date_vente.slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + a.benefice_net;
  });
  const months = Object.keys(byMonth).sort().slice(-12);
  const labels  = months.map(m => {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  });
  const data = months.map(m => +byMonth[m].toFixed(2));

  const ctx = document.getElementById('chart-benefice').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  if (!months.length) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(v => v >= 0
          ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'),
        borderColor: data.map(v => v >= 0
          ? 'rgba(16,185,129,1)' : 'rgba(239,68,68,1)'),
        borderWidth: 1,
        borderRadius: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.parsed.y.toFixed(2)} €` } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => v + '€' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

// ── Modals ────────────────────────────────────────────────
function openAddModal() {
  document.getElementById('modal-title').textContent = 'Ajouter un article';
  document.getElementById('article-form').reset();
  document.getElementById('article-id').value       = '';
  document.getElementById('article-photo-url').value = '';
  document.getElementById('preview-box').style.display = 'none';
  document.getElementById('date-vente-group').style.opacity = '0.4';
  resetPhotoPreview();
  currentPhotoFile = null;
  showModal('modal', true);
}

function openEditModal(a) {
  document.getElementById('modal-title').textContent   = 'Modifier l\'article';
  document.getElementById('article-id').value          = a.id;
  document.getElementById('article-photo-url').value   = a.photo_url || '';
  document.getElementById('nom').value                 = a.nom;
  document.getElementById('categorie').value           = a.categorie || 'Autre';
  document.getElementById('prix_achat').value          = a.prix_achat;
  document.getElementById('prix_vente').value          = a.prix_vente;
  document.getElementById('frais_vinted').value        = '';
  document.getElementById('statut').value              = a.statut;
  document.getElementById('date_achat').value          = a.date_achat || '';
  document.getElementById('date_vente').value          = a.date_vente || '';
  document.getElementById('date-vente-group').style.opacity = a.statut === 'vendu' ? '1' : '0.4';

  if (a.photo_url) {
    document.getElementById('photo-preview').src             = a.photo_url;
    document.getElementById('photo-preview').style.display   = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';
  } else {
    resetPhotoPreview();
  }
  currentPhotoFile = null;
  updatePreview();
  showModal('modal', true);
}

function closeModal() { showModal('modal', false); currentPhotoFile = null; }

function askDelete(a) {
  deleteTargetId = a.id;
  deletePhotoUrl = a.photo_url || null;
  showModal('confirm-modal', true);
}

function showModal(id, show) {
  document.getElementById(id).style.display = show ? 'flex' : 'none';
  document.body.style.overflow = show ? 'hidden' : '';
}

// ── Photo input ───────────────────────────────────────────
function onPhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  currentPhotoFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('photo-preview').src             = ev.target.result;
    document.getElementById('photo-preview').style.display   = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function resetPhotoPreview() {
  document.getElementById('photo-preview').src             = '';
  document.getElementById('photo-preview').style.display   = 'none';
  document.getElementById('photo-placeholder').style.display = 'block';
  document.getElementById('photo-input').value             = '';
}

// ── Calculateur prix de vente ─────────────────────────────
// prix_vente = (prix_achat × (1 + marge%) + 0.70) / 0.95
function updateCalculator() {
  const achat = parseFloat(document.getElementById('calc-achat').value);
  const marge = parseFloat(document.getElementById('calc-marge').value);
  if (!achat || isNaN(marge)) {
    document.getElementById('calc-result').style.display = 'none';
    return;
  }
  const vente   = (achat * (1 + marge / 100) + FEE_FIXED) / (1 - FEE_RATE);
  const frais   = vente * FEE_RATE + FEE_FIXED;
  const benefice = vente - achat - frais;

  document.getElementById('calc-vente').textContent   = fmt(vente) + ' €';
  document.getElementById('calc-frais').textContent   = fmt(frais) + ' €';
  const bEl = document.getElementById('calc-benefice');
  bEl.textContent = fmt(benefice) + ' €';
  bEl.className   = benefice >= 0 ? 'green' : 'red';
  document.getElementById('calc-result').style.display = 'flex';
}

// ── Export CSV ────────────────────────────────────────────
function exportCSV() {
  if (!allArticles.length) { showToast('Aucun article à exporter', 'error'); return; }
  const cols = ['id','nom','categorie','prix_achat','prix_vente','frais_vinted',
                'benefice_net','marge','statut','date_achat','date_vente'];
  const header = cols.join(';');
  const rows = allArticles.map(a =>
    cols.map(c => {
      const v = a[c] ?? '';
      return typeof v === 'string' && v.includes(';') ? `"${v}"` : v;
    }).join(';')
  );
  const csv  = [header, ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `vinted-tracker-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export CSV téléchargé ✓');
}

// ── Paramètres ────────────────────────────────────────────
function openSettings() {
  document.getElementById('setting-threshold').value = stockThreshold;
  showModal('settings-modal', true);
}

function saveSettings() {
  const val = parseInt(document.getElementById('setting-threshold').value);
  if (val > 0) {
    stockThreshold = val;
    localStorage.setItem('stock_threshold', val);
    showModal('settings-modal', false);
    renderArticles();
    showToast('Paramètres enregistrés ✓');
  }
}

// ── Preview calcul temps réel ─────────────────────────────
function updatePreview() {
  const achat  = parseFloat(document.getElementById('prix_achat').value) || 0;
  const vente  = parseFloat(document.getElementById('prix_vente').value) || 0;
  const fraisI = parseFloat(document.getElementById('frais_vinted').value);
  if (!achat || !vente) { document.getElementById('preview-box').style.display = 'none'; return; }
  const frais    = isNaN(fraisI) ? (vente * FEE_RATE + FEE_FIXED) : fraisI;
  const benefice = vente - achat - frais;
  const marge    = achat ? ((benefice / achat) * 100).toFixed(1) : 0;
  document.getElementById('prev-frais').textContent = fmt(frais) + ' €';
  const bEl = document.getElementById('prev-benefice');
  bEl.textContent = fmt(benefice) + ' €';
  bEl.className   = benefice >= 0 ? 'green' : 'red';
  document.getElementById('prev-marge').textContent = marge + ' %';
  document.getElementById('preview-box').style.display = 'flex';
}

// ── Utils ─────────────────────────────────────────────────
function fmt(n) { return (Math.round(n * 100) / 100).toFixed(2); }

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

let toastTimer;
function showToast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;
      z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.4);transition:opacity .3s;`;
    document.body.appendChild(el);
  }
  el.style.background = type === 'error' ? '#ef4444' : '#10b981';
  el.style.opacity    = '1';
  el.textContent      = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
