// ── État global ───────────────────────────────────────────
let allArticles    = [];
let currentFilter  = 'tous';
let deleteTargetId = null;
let deletePhotoUrl = null;
let currentPhotoFile = null;
let stockThreshold = parseInt(localStorage.getItem('stock_threshold') || '30');

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  loadAll();

  // Header
  document.getElementById('btn-add').addEventListener('click', openAddModal);
  document.getElementById('btn-calc').addEventListener('click', openCalc);
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-settings').addEventListener('click', openSettings);

  // Modal article
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('form-cancel').addEventListener('click', closeModal);
  document.getElementById('article-form').addEventListener('submit', submitForm);
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });
  document.getElementById('statut').addEventListener('change', e => {
    document.getElementById('date-vente-group').style.opacity =
      e.target.value === 'vendu' ? '1' : '0.4';
  });
  ['prix_achat', 'prix_vente', 'frais_vinted'].forEach(id =>
    document.getElementById(id).addEventListener('input', updatePreview)
  );

  // Photo
  document.getElementById('photo-upload-area').addEventListener('click',
    () => document.getElementById('photo-input').click());
  document.getElementById('photo-input').addEventListener('change', onPhotoSelected);

  // Calculateur
  document.getElementById('calc-close').addEventListener('click', () => showModal('calc-modal', false));
  document.getElementById('calc-achat').addEventListener('input', updateCalc);
  document.getElementById('calc-marge').addEventListener('input', updateCalc);

  // Paramètres
  document.getElementById('settings-close').addEventListener('click', () => showModal('settings-modal', false));
  document.getElementById('settings-save').addEventListener('click', saveSettings);

  // Suppression
  document.getElementById('confirm-cancel').addEventListener('click', () => showModal('confirm-modal', false));
  document.getElementById('confirm-ok').addEventListener('click', confirmDelete);

  // Filtres
  document.querySelectorAll('.filter-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderArticles();
    })
  );
});

// ── Chargement ────────────────────────────────────────────
async function loadAll() {
  try {
    allArticles = await loadArticles();
    renderStats();
    renderArticles();
  } catch (e) {
    showToast('Erreur de connexion à Supabase', 'error');
    console.error(e);
  }
}

// ── Stats (3 cartes) ──────────────────────────────────────
function renderStats() {
  const vendus   = allArticles.filter(a => a.statut === 'vendu');
  const en_stock = allArticles.filter(a => a.statut === 'en stock');
  const benefice = +vendus.reduce((s, a) => s + a.benefice_net, 0).toFixed(2);

  const bEl = document.getElementById('stat-benefice');
  bEl.textContent = fmt(benefice) + ' €';
  bEl.className   = 'stat-value ' + (benefice >= 0 ? 'green' : 'red');
  document.getElementById('stat-vendus').textContent  = vendus.length;
  document.getElementById('stat-capital').textContent =
    fmt(en_stock.reduce((s, a) => s + a.prix_achat, 0)) + ' €';
}

// ── Render articles ───────────────────────────────────────
function renderArticles() {
  const list     = document.getElementById('article-list');
  const empty    = document.getElementById('empty-state');
  const filtered = currentFilter === 'tous'
    ? allArticles : allArticles.filter(a => a.statut === currentFilter);

  list.querySelectorAll('.article-card').forEach(el => el.remove());
  if (!filtered.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  filtered.forEach(a => list.appendChild(buildCard(a)));
}

function buildCard(a) {
  const warn = a.days_in_stock != null && a.days_in_stock > stockThreshold;
  const card = document.createElement('div');
  card.className = `article-card${a.statut === 'vendu' ? ' vendu' : ''}`;
  card.innerHTML = `
    ${a.photo_url ? `<img class="card-photo" src="${esc(a.photo_url)}" alt="${esc(a.nom)}" loading="lazy">` : ''}
    <div class="card-body">
      <div class="card-top">
        <div class="card-nom-wrap">
          <span class="card-nom">${esc(a.nom)}</span>
          <div class="card-meta">
            <span class="cat-badge cat-${esc(a.categorie||'Autre')}">${esc(a.categorie||'Autre')}</span>
            ${warn ? `<span class="badge-warning">⚠️ ${a.days_in_stock}j</span>` : ''}
            ${a.statut==='en stock'&&a.date_achat ? `<span class="card-date">acheté le ${fmtDate(a.date_achat)}</span>` : ''}
            ${a.statut==='vendu'&&a.date_vente ? `<span class="card-date">vendu le ${fmtDate(a.date_vente)}</span>` : ''}
          </div>
        </div>
        <span class="badge ${a.statut==='vendu'?'badge-vendu':'badge-stock'}">
          ${a.statut==='vendu'?'✓ Vendu':'📦 En stock'}
        </span>
      </div>
      <div class="card-prices">
        <div class="price-item"><span class="price-label">Achat</span><span class="price-val muted">${fmt(a.prix_achat)} €</span></div>
        <div class="price-item"><span class="price-label">Vente</span><span class="price-val">${fmt(a.prix_vente)} €</span></div>
        <div class="price-item"><span class="price-label">Bénéfice</span><span class="price-val ${a.benefice_net>=0?'green':'red'}">${fmt(a.benefice_net)} €</span></div>
        <div class="price-item"><span class="price-label">Marge</span><span class="price-val ${a.marge>=0?'green':'red'}">${a.marge} %</span></div>
      </div>
      <div class="card-actions">
        <button class="btn-icon edit">✏️ Modifier</button>
        <button class="btn-icon delete">🗑️ Supprimer</button>
      </div>
    </div>`;
  card.querySelector('.edit').addEventListener('click',   () => openEditModal(a));
  card.querySelector('.delete').addEventListener('click', () => askDelete(a));
  return card;
}

// ── Formulaire ────────────────────────────────────────────
async function submitForm(e) {
  e.preventDefault();
  const id     = document.getElementById('article-id').value;
  const statut = document.getElementById('statut').value;
  let photo_url = document.getElementById('article-photo-url').value || null;

  if (currentPhotoFile) {
    try { photo_url = await uploadPhoto(currentPhotoFile); }
    catch { showToast('Erreur upload photo', 'error'); return; }
  }

  const payload = {
    nom:          document.getElementById('nom').value.trim(),
    categorie:    document.getElementById('categorie').value,
    prix_achat:   parseFloat(document.getElementById('prix_achat').value),
    prix_vente:   parseFloat(document.getElementById('prix_vente').value),
    frais_vinted: document.getElementById('frais_vinted').value
      ? parseFloat(document.getElementById('frais_vinted').value) : null,
    statut,
    date_achat:  document.getElementById('date_achat').value  || null,
    date_vente:  statut === 'vendu'
      ? (document.getElementById('date_vente').value || null) : null,
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
    showToast('Erreur lors de l\'enregistrement', 'error'); console.error(err);
  }
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  try {
    const res = await fetch(`${API}?id=eq.${deleteTargetId}`, { method: 'DELETE', headers: HEADERS });
    if (!res.ok) throw new Error(await res.text());
    if (deletePhotoUrl) await deletePhoto(deletePhotoUrl);
    showModal('confirm-modal', false);
    deleteTargetId = deletePhotoUrl = null;
    await loadAll();
    showToast('Article supprimé');
  } catch (err) {
    showToast('Erreur suppression', 'error'); console.error(err);
  }
}

// ── Storage ───────────────────────────────────────────────
async function uploadPhoto(file) {
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`;
  const res = await fetch(`${STORAGE_BASE}/${BUCKET}/${filename}`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
               'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
  return `${STORAGE_BASE}/public/${BUCKET}/${filename}`;
}

async function deletePhoto(url) {
  const parts = url.split(`/public/${BUCKET}/`);
  if (parts.length < 2) return;
  await fetch(`${STORAGE_BASE}/${BUCKET}`, {
    method: 'DELETE', headers: HEADERS,
    body: JSON.stringify({ prefixes: [parts[1]] }),
  });
}

// ── Modals ────────────────────────────────────────────────
function openAddModal() {
  document.getElementById('modal-title').textContent = 'Ajouter un article';
  document.getElementById('article-form').reset();
  document.getElementById('article-id').value        = '';
  document.getElementById('article-photo-url').value = '';
  document.getElementById('preview-box').style.display = 'none';
  document.getElementById('date-vente-group').style.opacity = '0.4';
  resetPhotoPreview(); currentPhotoFile = null;
  showModal('modal', true);
}

function openEditModal(a) {
  document.getElementById('modal-title').textContent  = 'Modifier l\'article';
  document.getElementById('article-id').value         = a.id;
  document.getElementById('article-photo-url').value  = a.photo_url || '';
  document.getElementById('nom').value                = a.nom;
  document.getElementById('categorie').value          = a.categorie || 'Autre';
  document.getElementById('prix_achat').value         = a.prix_achat;
  document.getElementById('prix_vente').value         = a.prix_vente;
  document.getElementById('frais_vinted').value       = '';
  document.getElementById('statut').value             = a.statut;
  document.getElementById('date_achat').value         = a.date_achat || '';
  document.getElementById('date_vente').value         = a.date_vente || '';
  document.getElementById('date-vente-group').style.opacity = a.statut === 'vendu' ? '1' : '0.4';
  if (a.photo_url) {
    document.getElementById('photo-preview').src              = a.photo_url;
    document.getElementById('photo-preview').style.display    = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';
  } else { resetPhotoPreview(); }
  currentPhotoFile = null;
  updatePreview();
  showModal('modal', true);
}

function closeModal() { showModal('modal', false); currentPhotoFile = null; }
function askDelete(a) { deleteTargetId = a.id; deletePhotoUrl = a.photo_url || null; showModal('confirm-modal', true); }
function showModal(id, show) {
  document.getElementById(id).style.display = show ? 'flex' : 'none';
  document.body.style.overflow = show ? 'hidden' : '';
}

// ── Photo ─────────────────────────────────────────────────
function onPhotoSelected(e) {
  const file = e.target.files[0]; if (!file) return;
  currentPhotoFile = file;
  const r = new FileReader();
  r.onload = ev => {
    document.getElementById('photo-preview').src              = ev.target.result;
    document.getElementById('photo-preview').style.display    = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';
  };
  r.readAsDataURL(file);
}
function resetPhotoPreview() {
  document.getElementById('photo-preview').src              = '';
  document.getElementById('photo-preview').style.display    = 'none';
  document.getElementById('photo-placeholder').style.display = 'block';
  document.getElementById('photo-input').value              = '';
}

// ── Calculateur ───────────────────────────────────────────
function openCalc() {
  document.getElementById('calc-achat').value = '';
  document.getElementById('calc-marge').value = '';
  document.getElementById('calc-result').style.display = 'none';
  showModal('calc-modal', true);
}
function updateCalc() {
  const achat = parseFloat(document.getElementById('calc-achat').value);
  const marge = parseFloat(document.getElementById('calc-marge').value);
  if (!achat || isNaN(marge)) { document.getElementById('calc-result').style.display = 'none'; return; }
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
  const csv  = [cols.join(';'),
    ...allArticles.map(a => cols.map(c => {
      const v = a[c] ?? '';
      return String(v).includes(';') ? `"${v}"` : v;
    }).join(';'))
  ].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `vinted-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('Export CSV téléchargé ✓');
}

// ── Paramètres ────────────────────────────────────────────
function openSettings() {
  document.getElementById('setting-threshold').value = stockThreshold;
  showModal('settings-modal', true);
}
function saveSettings() {
  const v = parseInt(document.getElementById('setting-threshold').value);
  if (v > 0) {
    stockThreshold = v;
    localStorage.setItem('stock_threshold', v);
    showModal('settings-modal', false);
    renderArticles();
    showToast('Paramètres enregistrés ✓');
  }
}

// ── Preview bénéfice ──────────────────────────────────────
function updatePreview() {
  const achat  = parseFloat(document.getElementById('prix_achat').value) || 0;
  const vente  = parseFloat(document.getElementById('prix_vente').value) || 0;
  const fraisI = parseFloat(document.getElementById('frais_vinted').value);
  if (!achat || !vente) { document.getElementById('preview-box').style.display = 'none'; return; }
  const frais    = isNaN(fraisI) ? vente * FEE_RATE + FEE_FIXED : fraisI;
  const benefice = vente - achat - frais;
  document.getElementById('prev-frais').textContent   = fmt(frais) + ' €';
  const bEl = document.getElementById('prev-benefice');
  bEl.textContent = fmt(benefice) + ' €'; bEl.className = benefice >= 0 ? 'green' : 'red';
  document.getElementById('prev-marge').textContent   =
    (achat ? ((benefice / achat) * 100).toFixed(1) : 0) + ' %';
  document.getElementById('preview-box').style.display = 'flex';
}
