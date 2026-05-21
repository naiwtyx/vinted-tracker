// ── État global ───────────────────────────────────────────
let allArticles    = [];
let currentTab     = 'stock';
let deleteTargetId = null;
let deletePhotoUrl = null;
let currentPhotoFile = null;
let stockThreshold = parseInt(localStorage.getItem('stock_threshold') || '30');

// Recherche & tri
let searchQuery = '';
let sortField   = 'created_at';
let sortDir     = 'desc';

// Objectif mensuel & budget
let monthlyGoal = parseFloat(localStorage.getItem('monthly_goal') || '0');
let budgetBase  = parseFloat(localStorage.getItem('budget_base')  || '0');

// Seuils de marge & filtre couleur
let marginLow    = parseFloat(localStorage.getItem('margin_low')  || '20');
let marginHigh   = parseFloat(localStorage.getItem('margin_high') || '40');
let marginFilter = 'all';

// ── SVG icons réutilisables ───────────────────────────────
const SVG_EDIT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const SVG_SHARE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  loadAll();

  // Sidebar / header
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
  ['prix_achat', 'prix_vente'].forEach(id =>
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

  // Onglets contenu
  document.querySelectorAll('.content-tab').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.content-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderArticles();
    })
  );

  // Recherche
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderArticles();
  });

  // Tri
  updateSortButtons();
  document.querySelectorAll('.sort-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      if (sortField === field) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortField = field;
        sortDir   = (field === 'nom') ? 'asc' : 'desc';
      }
      updateSortButtons();
      renderArticles();
    })
  );

  // Objectif mensuel — inline edit
  document.getElementById('stat-objective-val').addEventListener('click', () => {
    const v = prompt('Objectif mensuel de bénéfice (€) :', monthlyGoal || '');
    const n = parseFloat(v);
    if (!isNaN(n) && n >= 0) {
      monthlyGoal = n;
      localStorage.setItem('monthly_goal', n);
      renderObjective();
    }
  });

  // Mobile bottom bar
  const mbbAdd      = document.getElementById('mbb-add');
  const mbbSettings = document.getElementById('mbb-settings');
  if (mbbAdd)      mbbAdd.addEventListener('click', openAddModal);
  if (mbbSettings) mbbSettings.addEventListener('click', openSettings);

  // Filtre par marge
  document.querySelectorAll('.mf-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      marginFilter = btn.dataset.mf;
      document.querySelectorAll('.mf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderArticles();
    })
  );

  // Budget — inline edit
  document.getElementById('stat-budget-val').addEventListener('click', () => {
    const v = prompt('Budget de départ (€) — votre capital initial avant d\'acheter :', budgetBase || '');
    const n = parseFloat(v);
    if (!isNaN(n) && n >= 0) {
      budgetBase = n;
      localStorage.setItem('budget_base', n);
      renderBudget();
    }
  });

  // Validation temps réel
  setupFormValidation();
});

// ── Chargement ────────────────────────────────────────────
async function loadAll() {
  try {
    allArticles = await loadArticles();
    renderStats();
    renderObjective();
    renderBudget();
    renderArticles();
  } catch (e) {
    showToast('Erreur de connexion à Supabase', 'error');
    console.error(e);
  }
}

// ── Stats (3 cartes principales) ──────────────────────────
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

// ── Objectif mensuel ──────────────────────────────────────
function renderObjective() {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();
  const monthBenefice = +allArticles
    .filter(a => a.statut === 'vendu' && a.date_vente)
    .filter(a => { const d = new Date(a.date_vente); return d.getFullYear() === y && d.getMonth() === m; })
    .reduce((s, a) => s + a.benefice_net, 0).toFixed(2);

  const el  = document.getElementById('stat-objective-val');
  const bar = document.getElementById('objective-bar');
  const wrap = document.getElementById('objective-bar-wrap');

  if (monthlyGoal > 0) {
    el.textContent = `${fmt(monthBenefice)} / ${fmt(monthlyGoal)} €`;
    const pct = Math.min(100, (monthBenefice / monthlyGoal) * 100);
    bar.style.width  = pct + '%';
    bar.className    = 'progress-fill ' + (pct >= 100 ? 'green' : pct >= 75 ? 'orange' : 'blue');
    wrap.style.display = '';
  } else {
    el.textContent = '— Cliquer pour définir';
    wrap.style.display = 'none';
  }
}

// ── Budget disponible ──────────────────────────────────────
function renderBudget() {
  const vendus   = allArticles.filter(a => a.statut === 'vendu');
  const enStock  = allArticles.filter(a => a.statut === 'en stock');
  const bEl      = document.getElementById('stat-budget-val');
  const varEl    = document.getElementById('stat-budget-variation');

  if (budgetBase <= 0) {
    bEl.textContent = '— Cliquer pour définir';
    bEl.className   = 'stat-value';
    varEl.textContent = '';
    return;
  }

  // budget = capital initial + bénéfices vendus - capital immobilisé en stock
  const current = +(budgetBase
    + vendus.reduce((s, a) => s + a.benefice_net, 0)
    - enStock.reduce((s, a) => s + a.prix_achat, 0)).toFixed(2);

  bEl.textContent = fmt(current) + ' €';
  bEl.className   = 'stat-value ' + (current >= 0 ? '' : 'red');

  // Variation du jour
  const today      = new Date().toISOString().slice(0, 10);
  const soldToday  = allArticles
    .filter(a => a.statut === 'vendu' && a.date_vente === today)
    .reduce((s, a) => s + a.prix_vente, 0);
  const boughtToday = allArticles
    .filter(a => a.date_achat === today)
    .reduce((s, a) => s + a.prix_achat, 0);
  const variation  = +(soldToday - boughtToday).toFixed(2);

  if (variation !== 0) {
    varEl.textContent = (variation > 0 ? '+' : '') + fmt(variation) + ' € auj.';
    varEl.className   = 'stat-variation ' + (variation > 0 ? 'green' : 'red');
  } else {
    varEl.textContent = '';
    varEl.className   = 'stat-variation';
  }
}

// ── Tri : état visuel des boutons ─────────────────────────
function updateSortButtons() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    const field    = btn.dataset.field;
    const label    = btn.dataset.label;
    const isActive = field === sortField;
    btn.classList.toggle('active', isActive);
    btn.textContent = label + (isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');
  });
}

// ── Helpers marge ─────────────────────────────────────────
function getMarginClass(marge) {
  if (marge < marginLow)  return 'bad';
  if (marge <= marginHigh) return 'medium';
  return 'good';
}

// ── Filtrage + tri des articles en stock ──────────────────
function getFilteredSorted() {
  let items = allArticles.filter(a => a.statut === 'en stock');

  // Recherche
  if (searchQuery) {
    items = items.filter(a =>
      a.nom.toLowerCase().includes(searchQuery) ||
      (a.categorie || '').toLowerCase().includes(searchQuery) ||
      String(a.prix_achat).includes(searchQuery) ||
      String(a.prix_vente).includes(searchQuery)
    );
  }

  // Filtre marge couleur
  if (marginFilter !== 'all') {
    items = items.filter(a => getMarginClass(a.marge) === marginFilter);
  }

  // Tri
  items.sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'nom') {
      va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    if (sortField === 'created_at' || sortField === 'date_achat') {
      va = va ? +new Date(va) : 0;
      vb = vb ? +new Date(vb) : 0;
    }
    va = va ?? 0; vb = vb ?? 0;
    if (va < vb) return sortDir === 'asc' ? -1 :  1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  return items;
}

// ── Render articles ───────────────────────────────────────
function renderArticles() {
  const stockSection = document.getElementById('stock-section');
  const venduList    = document.getElementById('vendu-list');
  const stockEmpty   = document.getElementById('empty-state');
  const venduEmpty   = document.getElementById('empty-vendu');
  const stockList    = document.getElementById('article-list');
  const resultCount  = document.getElementById('result-count');

  if (currentTab === 'stock') {
    stockSection.style.display = '';
    venduList.style.display    = 'none';

    const items = getFilteredSorted();
    stockList.querySelectorAll('.article-card').forEach(el => el.remove());

    if (!items.length) {
      stockEmpty.style.display = 'block';
      resultCount.textContent  = '';
    } else {
      stockEmpty.style.display = 'none';
      const total = allArticles.filter(a => a.statut === 'en stock').length;
      resultCount.textContent  = items.length < total
        ? `${items.length} résultat${items.length > 1 ? 's' : ''} sur ${total}`
        : `${total} article${total > 1 ? 's' : ''}`;
      items.forEach(a => stockList.appendChild(buildCard(a)));
    }
  } else {
    stockSection.style.display = 'none';
    venduList.style.display    = '';

    const items = allArticles.filter(a => a.statut === 'vendu');
    venduList.querySelectorAll('.sold-card').forEach(el => el.remove());
    venduEmpty.style.display = items.length ? 'none' : 'block';
    items.forEach(a => venduList.appendChild(buildSoldCard(a)));
  }
}

// ── Card en stock ─────────────────────────────────────────
function buildCard(a) {
  const warn = a.days_in_stock != null && a.days_in_stock > stockThreshold;
  const mcls = getMarginClass(a.marge);
  const card = document.createElement('div');
  card.className = `article-card marge-${mcls}`;
  card.innerHTML = `
    ${a.photo_url ? `<img class="card-photo" src="${esc(a.photo_url)}" alt="${esc(a.nom)}" loading="lazy">` : ''}
    <div class="card-body">
      <div class="card-top">
        <div class="card-nom-wrap">
          <span class="card-nom">${esc(a.nom)}</span>
          <div class="card-meta">
            <span class="cat-badge cat-${esc(a.categorie||'Autre')}">${esc(a.categorie||'Autre')}</span>
            ${warn ? `<span class="badge-warning">⚠️ ${a.days_in_stock}j</span>` : ''}
            ${a.date_achat ? `<span class="card-date">acheté le ${fmtDate(a.date_achat)}</span>` : ''}
          </div>
        </div>
        <span class="badge badge-stock">En stock</span>
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
          <span class="price-val ${a.benefice_net>=0?'green':'red'}">${fmt(a.benefice_net)} €</span>
        </div>
        <div class="price-item">
          <span class="price-label">Marge</span>
          <span class="marge-badge marge-${mcls}">${a.marge} %</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-action edit"  title="Modifier"   aria-label="Modifier">${SVG_EDIT}</button>
        <button class="btn-action share" title="Partager"   aria-label="Partager">${SVG_SHARE}</button>
        <button class="btn-action delete" title="Supprimer" aria-label="Supprimer" style="margin-left:auto">${SVG_TRASH}</button>
      </div>
    </div>`;
  card.querySelector('.edit').addEventListener('click',   () => openEditModal(a));
  card.querySelector('.delete').addEventListener('click', () => askDelete(a));
  card.querySelector('.share').addEventListener('click',  () => shareArticle(a));
  return card;
}

// ── Card vendu (compact) ──────────────────────────────────
function buildSoldCard(a) {
  const card = document.createElement('div');
  card.className = 'sold-card';
  card.innerHTML = `
    ${a.photo_url
      ? `<img class="sold-card-photo" src="${esc(a.photo_url)}" alt="${esc(a.nom)}" loading="lazy">`
      : `<div class="sold-card-photo sold-card-nophoto"></div>`}
    <div class="sold-card-body">
      <span class="sold-card-name">${esc(a.nom)}</span>
      <div class="sold-card-row">
        <span class="sold-card-profit ${a.benefice_net >= 0 ? 'green' : 'red'}">
          ${a.benefice_net >= 0 ? '+' : ''}${fmt(a.benefice_net)} €
        </span>
        ${a.date_vente ? `<span class="sold-card-date">${fmtDate(a.date_vente)}</span>` : ''}
      </div>
      <div class="sold-card-actions" style="display:flex;gap:4px;margin-top:4px">
        <button class="btn-action edit"   title="Modifier"   aria-label="Modifier">${SVG_EDIT}</button>
        <button class="btn-action delete" title="Supprimer"  aria-label="Supprimer" style="margin-left:auto">${SVG_TRASH}</button>
      </div>
    </div>`;
  card.querySelector('.edit').addEventListener('click',   () => openEditModal(a));
  card.querySelector('.delete').addEventListener('click', () => askDelete(a));
  return card;
}

// ── Partage d'article ─────────────────────────────────────
function shareArticle(a) {
  const base  = location.href.replace(/index\.html.*$/, '');
  const email = localStorage.getItem('contact_email') || '';
  const url   = `${base}article.html?id=${a.id}${email ? '&contact=' + encodeURIComponent(email) : ''}`;

  if (navigator.share) {
    navigator.share({ title: a.nom, text: `${a.nom} — ${fmt(a.prix_vente)} €`, url });
  } else {
    navigator.clipboard.writeText(url)
      .then(() => showToast('Lien copié ✓'))
      .catch(() => {
        prompt('Copie ce lien :', url);
      });
  }
}

// ── Formulaire ────────────────────────────────────────────
async function submitForm(e) {
  e.preventDefault();
  const submitBtn = document.querySelector('#article-form [type="submit"]');
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  const id     = document.getElementById('article-id').value;
  const statut = document.getElementById('statut').value;
  let photo_url = document.getElementById('article-photo-url').value || null;

  if (currentPhotoFile) {
    try { photo_url = await uploadPhoto(currentPhotoFile); }
    catch {
      showToast('Erreur upload photo', 'error');
      submitBtn.classList.remove('loading'); submitBtn.disabled = false; return;
    }
  }

  const payload = {
    nom:        document.getElementById('nom').value.trim(),
    categorie:  document.getElementById('categorie').value,
    prix_achat: parseFloat(document.getElementById('prix_achat').value),
    prix_vente: parseFloat(document.getElementById('prix_vente').value),
    statut,
    date_achat: document.getElementById('date_achat').value  || null,
    date_vente: statut === 'vendu'
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
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
}

// ── Validation temps réel ─────────────────────────────────
function setupFormValidation() {
  const rules = [
    { id: 'nom',        check: v => v.trim().length > 0 },
    { id: 'prix_achat', check: v => v !== '' && parseFloat(v) >= 0 },
    { id: 'prix_vente', check: v => v !== '' && parseFloat(v) >= 0 },
  ];
  rules.forEach(({ id, check }) => {
    const input = document.getElementById(id);
    if (!input) return;
    const update = () => {
      const filled = input.value !== '';
      input.classList.toggle('input-valid',   filled && check(input.value));
      input.classList.toggle('input-invalid', filled && !check(input.value));
    };
    input.addEventListener('input', update);
    input.addEventListener('blur',  update);
  });
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

// ── Storage photos ────────────────────────────────────────
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

function closeModal() {
  showModal('modal', false);
  currentPhotoFile = null;
  ['nom', 'prix_achat', 'prix_vente'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('input-valid', 'input-invalid');
  });
}
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
  if (!achat || isNaN(marge) || marge >= 100) {
    document.getElementById('calc-result').style.display = 'none'; return;
  }
  const vente   = achat / (1 - marge / 100);
  const benefice = vente - achat;
  document.getElementById('calc-vente').textContent = fmt(vente) + ' €';
  const bEl = document.getElementById('calc-benefice');
  bEl.textContent = fmt(benefice) + ' €';
  bEl.className   = benefice >= 0 ? 'green' : 'red';
  document.getElementById('calc-result').style.display = 'flex';
}

// ── Export CSV ────────────────────────────────────────────
function exportCSV() {
  if (!allArticles.length) { showToast('Aucun article à exporter', 'error'); return; }
  const cols = ['id','nom','categorie','prix_achat','prix_vente',
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
  document.getElementById('setting-threshold').value    = stockThreshold;
  document.getElementById('setting-email').value        = localStorage.getItem('contact_email') || '';
  document.getElementById('setting-margin-low').value   = marginLow;
  document.getElementById('setting-margin-high').value  = marginHigh;
  showModal('settings-modal', true);
}
function saveSettings() {
  const v     = parseInt(document.getElementById('setting-threshold').value);
  const email = document.getElementById('setting-email').value.trim();
  const ml    = parseFloat(document.getElementById('setting-margin-low').value);
  const mh    = parseFloat(document.getElementById('setting-margin-high').value);

  if (v > 0)        { stockThreshold = v;  localStorage.setItem('stock_threshold', v); }
  if (!isNaN(ml) && ml >= 0) { marginLow  = ml; localStorage.setItem('margin_low',  ml); }
  if (!isNaN(mh) && mh >= 0) { marginHigh = mh; localStorage.setItem('margin_high', mh); }
  localStorage.setItem('contact_email', email);

  showModal('settings-modal', false);
  renderArticles();
  showToast('Paramètres enregistrés ✓');
}

// ── Preview bénéfice ──────────────────────────────────────
function updatePreview() {
  const achat = parseFloat(document.getElementById('prix_achat').value) || 0;
  const vente = parseFloat(document.getElementById('prix_vente').value) || 0;
  if (!achat || !vente) { document.getElementById('preview-box').style.display = 'none'; return; }
  const benefice = vente - achat;
  const marge    = achat ? ((benefice / achat) * 100).toFixed(1) : 0;
  const bEl = document.getElementById('prev-benefice');
  bEl.textContent = fmt(benefice) + ' €';
  bEl.className   = benefice >= 0 ? 'green' : 'red';
  document.getElementById('prev-marge').textContent = marge + ' %';
  document.getElementById('preview-box').style.display = 'flex';
}
