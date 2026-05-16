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

const FEE_RATE  = 0.05;
const FEE_FIXED = 0.70;

const CAT_COLORS = {
  'Sneakers':     '#7c3aed',
  'Vêtements':    '#2563eb',
  'Accessoires':  '#db2777',
  'Électronique': '#0891b2',
  'Autre':        '#64748b',
};

// ── Calcul article ────────────────────────────────────────
function computeArticle(a) {
  const frais        = a.frais_vinted != null
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

// ── Chargement Supabase ───────────────────────────────────
async function loadArticles() {
  const res = await fetch(`${API}?order=created_at.desc`, { headers: HEADERS });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.map(computeArticle);
}

// ── Utils ─────────────────────────────────────────────────
function fmt(n) { return (Math.round(n * 100) / 100).toFixed(2); }

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtMonth(yyyymm) {
  const [y, m] = yyyymm.split('-');
  return new Date(+y, +m - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

let _toastTimer;
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
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}
