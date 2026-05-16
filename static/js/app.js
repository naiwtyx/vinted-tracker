// ── Config Supabase ───────────────────────────────────────
// Remplace ces deux valeurs par celles de ton projet Supabase
// (Settings → API dans le dashboard)
const SUPABASE_URL = 'https://glojwzaswaoradcxeqmx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdsb2p3emFzd2FvcmFkY3hlcW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjMzNjcsImV4cCI6MjA5NDQ5OTM2N30.1DC5oDCa8667Nfjc9YL-xy7ZNvVgaE2dWFv4bKyp_GQ';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Calcul frais Vinted ───────────────────────────────────
const FEE_RATE = 0.05;
const FEE_FIXED = 0.70;

function computeArticle(a) {
  const frais = (a.frais_vinted != null)
    ? a.frais_vinted
    : +(a.prix_vente * FEE_RATE + FEE_FIXED).toFixed(2);
  const benefice_net = +(a.prix_vente - a.prix_achat - frais).toFixed(2);
  const marge = a.prix_achat
    ? +((benefice_net / a.prix_achat) * 100).toFixed(1)
    : 0;
  return { ...a, frais_vinted: frais, benefice_net, marge };
}

function computeStats(articles) {
  const vendus   = articles.filter(a => a.statut === 'vendu');
  const en_stock = articles.filter(a => a.statut === 'en stock');
  return {
    benefice_total:    +vendus.reduce((s, a) => s + a.benefice_net, 0).toFixed(2),
    marge_moyenne:     vendus.length
      ? +(vendus.reduce((s, a) => s + a.marge, 0) / vendus.length).toFixed(1)
      : 0,
    nb_vendus:         vendus.length,
    nb_en_stock:       en_stock.length,
    capital_immobilise: +en_stock.reduce((s, a) => s + a.prix_achat, 0).toFixed(2),
  };
}

// ── État global ───────────────────────────────────────────
let allArticles    = [];
let currentFilter  = 'tous';
let deleteTargetId = null;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  loadAll();

  document.getElementById('btn-add').addEventListener('click', openAddModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('form-cancel').addEventListener('click', closeModal);
  document.getElementById('article-form').addEventListener('submit', submitForm);
  document.getElementById('confirm-cancel').addEventListener('click', () => showModal('confirm-modal', false));
  document.getElementById('confirm-ok').addEventListener('click', confirmDelete);

  ['prix_achat', 'prix_vente', 'frais_vinted'].forEach(id =>
    document.getElementById(id).addEventListener('input', updatePreview)
  );

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderArticles();
    });
  });

  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeModal();
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
    const { data, error } = await db
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    allArticles = data.map(computeArticle);
    renderStats(computeStats(allArticles));
    renderArticles();
  } catch (e) {
    showToast('Erreur de connexion à Supabase', 'error');
    console.error(e);
  }
}

async function submitForm(e) {
  e.preventDefault();
  const id       = document.getElementById('article-id').value;
  const fraisRaw = document.getElementById('frais_vinted').value;
  const payload  = {
    nom:          document.getElementById('nom').value.trim(),
    prix_achat:   parseFloat(document.getElementById('prix_achat').value),
    prix_vente:   parseFloat(document.getElementById('prix_vente').value),
    frais_vinted: fraisRaw ? parseFloat(fraisRaw) : null,
    statut:       document.getElementById('statut').value,
  };

  try {
    let error;
    if (id) {
      ({ error } = await db.from('articles').update(payload).eq('id', id));
    } else {
      ({ error } = await db.from('articles').insert(payload));
    }
    if (error) throw error;
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
    const { error } = await db.from('articles').delete().eq('id', deleteTargetId);
    if (error) throw error;
    showModal('confirm-modal', false);
    deleteTargetId = null;
    await loadAll();
    showToast('Article supprimé');
  } catch (err) {
    showToast('Erreur lors de la suppression', 'error');
    console.error(err);
  }
}

// ── Render ────────────────────────────────────────────────
function renderStats(s) {
  document.getElementById('stat-benefice').textContent = fmt(s.benefice_total) + ' €';
  document.getElementById('stat-marge').textContent    = s.marge_moyenne + ' %';
  document.getElementById('stat-vendus').textContent   = s.nb_vendus;
  document.getElementById('stat-capital').textContent  = fmt(s.capital_immobilise) + ' €';

  const bEl = document.getElementById('stat-benefice');
  bEl.className = 'stat-value ' + (s.benefice_total >= 0 ? 'green' : 'red');
}

function renderArticles() {
  const list     = document.getElementById('article-list');
  const empty    = document.getElementById('empty-state');
  const filtered = currentFilter === 'tous'
    ? allArticles
    : allArticles.filter(a => a.statut === currentFilter);

  list.querySelectorAll('.article-card').forEach(el => el.remove());

  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  filtered.forEach(a => list.appendChild(buildCard(a)));
}

function buildCard(a) {
  const card = document.createElement('div');
  card.className = `article-card${a.statut === 'vendu' ? ' vendu' : ''}`;
  card.innerHTML = `
    <div class="card-top">
      <span class="card-nom">${esc(a.nom)}</span>
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
  `;
  card.querySelector('.edit').addEventListener('click',   () => openEditModal(a));
  card.querySelector('.delete').addEventListener('click', () => askDelete(a.id));
  return card;
}

// ── Modals ────────────────────────────────────────────────
function openAddModal() {
  document.getElementById('modal-title').textContent = 'Ajouter un article';
  document.getElementById('article-form').reset();
  document.getElementById('article-id').value = '';
  document.getElementById('preview-box').style.display = 'none';
  showModal('modal', true);
}

function openEditModal(a) {
  document.getElementById('modal-title').textContent = 'Modifier l\'article';
  document.getElementById('article-id').value   = a.id;
  document.getElementById('nom').value          = a.nom;
  document.getElementById('prix_achat').value   = a.prix_achat;
  document.getElementById('prix_vente').value   = a.prix_vente;
  document.getElementById('frais_vinted').value = '';
  document.getElementById('statut').value       = a.statut;
  updatePreview();
  showModal('modal', true);
}

function closeModal()      { showModal('modal', false); }
function askDelete(id)     { deleteTargetId = id; showModal('confirm-modal', true); }

function showModal(id, show) {
  document.getElementById(id).style.display = show ? 'flex' : 'none';
  document.body.style.overflow = show ? 'hidden' : '';
}

// ── Preview calcul temps réel ─────────────────────────────
function updatePreview() {
  const achat  = parseFloat(document.getElementById('prix_achat').value)   || 0;
  const vente  = parseFloat(document.getElementById('prix_vente').value)   || 0;
  const fraisI = parseFloat(document.getElementById('frais_vinted').value);

  if (!achat || !vente) {
    document.getElementById('preview-box').style.display = 'none';
    return;
  }

  const frais   = isNaN(fraisI) ? (vente * FEE_RATE + FEE_FIXED) : fraisI;
  const benefice = vente - achat - frais;
  const marge    = achat ? ((benefice / achat) * 100).toFixed(1) : 0;

  document.getElementById('prev-frais').textContent    = fmt(frais) + ' €';
  const bEl = document.getElementById('prev-benefice');
  bEl.textContent = fmt(benefice) + ' €';
  bEl.className   = benefice >= 0 ? 'green' : 'red';
  document.getElementById('prev-marge').textContent    = marge + ' %';
  document.getElementById('preview-box').style.display = 'flex';
}

// ── Utils ─────────────────────────────────────────────────
function fmt(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
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
    el.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      color:#fff; padding:10px 20px; border-radius:8px;
      font-size:14px; font-weight:600; z-index:999;
      box-shadow:0 4px 16px rgba(0,0,0,0.4); transition:opacity 0.3s;
    `;
    document.body.appendChild(el);
  }
  el.style.background = type === 'error' ? '#ef4444' : '#10b981';
  el.style.opacity    = '1';
  el.textContent      = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
