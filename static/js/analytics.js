// ── Config Chart.js globale ───────────────────────────────
Chart.defaults.color         = '#94a3b8';
Chart.defaults.borderColor   = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family   = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
Chart.defaults.font.size     = 12;

const CHART_OPTS_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 500 },
};

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const articles = await loadArticles();
    document.getElementById('loading').style.display          = 'none';
    document.getElementById('analytics-content').style.display = 'block';
    renderKPIs(articles);
    renderBarChart(articles);
    renderLineChart(articles);
    renderDoughnutChart(articles);
    renderCatTable(articles);
    renderTopTables(articles);
  } catch (e) {
    document.getElementById('loading').innerHTML =
      '<p style="color:#ef4444">Erreur de chargement Supabase.<br>Vérifie ta connexion.</p>';
    console.error(e);
  }
});

// ── KPIs ──────────────────────────────────────────────────
function renderKPIs(articles) {
  const vendus   = articles.filter(a => a.statut === 'vendu');
  const total    = articles.length;

  // Bénéfice total
  const beneficeTotal = +vendus.reduce((s, a) => s + a.benefice_net, 0).toFixed(2);
  const bEl = document.getElementById('kpi-benefice-total');
  bEl.textContent = fmt(beneficeTotal) + ' €';
  bEl.className   = 'stat-value ' + (beneficeTotal >= 0 ? 'green' : 'red');

  // Bénéfice moyen / article vendu
  const moyen = vendus.length ? +(beneficeTotal / vendus.length).toFixed(2) : null;
  const mEl = document.getElementById('kpi-benefice-moyen');
  mEl.textContent = moyen != null ? fmt(moyen) + ' €' : '—';
  if (moyen != null) mEl.className = 'stat-value ' + (moyen >= 0 ? 'green' : 'red');

  // Taux de rotation
  document.getElementById('kpi-rotation').textContent =
    total ? Math.round((vendus.length / total) * 100) + ' %' : '—';

  // Temps moyen de vente (global)
  const durees = vendus
    .filter(a => a.date_achat && a.date_vente)
    .map(a => Math.round((new Date(a.date_vente) - new Date(a.date_achat)) / 86400000));
  document.getElementById('kpi-temps-moyen').textContent =
    durees.length ? Math.round(durees.reduce((s, d) => s + d, 0) / durees.length) + ' j' : '—';

  // Mois le plus rentable
  const byMonth = {};
  vendus.filter(a => a.date_vente).forEach(a => {
    const k = a.date_vente.slice(0, 7);
    byMonth[k] = (byMonth[k] || 0) + a.benefice_net;
  });
  const bestMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('kpi-meilleur-mois').textContent =
    bestMonth ? `${fmtMonth(bestMonth[0])} (${fmt(bestMonth[1])} €)` : '—';

  // Meilleure catégorie (marge moy)
  const byCat = {};
  vendus.forEach(a => {
    if (!byCat[a.categorie]) byCat[a.categorie] = [];
    byCat[a.categorie].push(a.marge);
  });
  const bestCat = Object.entries(byCat)
    .map(([c, m]) => [c, +(m.reduce((s, v) => s + v, 0) / m.length).toFixed(1)])
    .sort((a, b) => b[1] - a[1])[0];
  document.getElementById('kpi-best-cat').textContent =
    bestCat ? `${bestCat[0]} (${bestCat[1]}%)` : '—';
}

// ── Bar chart : bénéfice par mois ────────────────────────
function renderBarChart(articles) {
  const vendus = articles.filter(a => a.statut === 'vendu' && a.date_vente);
  const byMonth = {};
  vendus.forEach(a => {
    const k = a.date_vente.slice(0, 7);
    byMonth[k] = +(((byMonth[k] || 0) + a.benefice_net).toFixed(2));
  });
  const months = Object.keys(byMonth).sort().slice(-18);

  if (!months.length) {
    document.getElementById('chart-bar').style.display  = 'none';
    document.getElementById('empty-bar').style.display  = 'block';
    return;
  }

  const data   = months.map(m => byMonth[m]);
  const labels = months.map(fmtMonth);

  new Chart(document.getElementById('chart-bar'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(v => v >= 0 ? 'rgba(16,185,129,0.65)' : 'rgba(239,68,68,0.65)'),
        borderColor:     data.map(v => v >= 0 ? '#10b981' : '#ef4444'),
        borderWidth: 1,
        borderRadius: 5,
      }],
    },
    options: {
      ...CHART_OPTS_BASE,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${fmt(c.parsed.y)} €` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => v + ' €' } },
      },
    },
  });
}

// ── Line chart : bénéfice cumulé ──────────────────────────
function renderLineChart(articles) {
  const vendus = articles
    .filter(a => a.statut === 'vendu' && a.date_vente)
    .sort((a, b) => a.date_vente.localeCompare(b.date_vente));

  if (!vendus.length) {
    document.getElementById('chart-line').style.display = 'none';
    document.getElementById('empty-line').style.display = 'block';
    return;
  }

  let cumul = 0;
  const labels = [];
  const data   = [];
  vendus.forEach(a => {
    cumul += a.benefice_net;
    labels.push(fmtDate(a.date_vente));
    data.push(+cumul.toFixed(2));
  });

  new Chart(document.getElementById('chart-line'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.12)',
        borderWidth: 2,
        pointRadius: data.length < 30 ? 4 : 1,
        pointBackgroundColor: '#7c3aed',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      ...CHART_OPTS_BASE,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${fmt(c.parsed.y)} €` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: { ticks: { callback: v => v + ' €' } },
      },
    },
  });
}

// ── Doughnut chart : répartition par catégorie ────────────
function renderDoughnutChart(articles) {
  const counts = {};
  articles.forEach(a => {
    const c = a.categorie || 'Autre';
    counts[c] = (counts[c] || 0) + 1;
  });
  const cats   = Object.keys(counts);
  const values = cats.map(c => counts[c]);
  const colors = cats.map(c => CAT_COLORS[c] || '#64748b');

  if (!cats.length) {
    document.getElementById('chart-doughnut').style.display  = 'none';
    document.getElementById('empty-doughnut').style.display  = 'block';
    return;
  }

  new Chart(document.getElementById('chart-doughnut'), {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor:     colors,
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      ...CHART_OPTS_BASE,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14, boxWidth: 12 } },
        tooltip: { callbacks: {
          label: c => ` ${c.label} : ${c.parsed} article${c.parsed > 1 ? 's' : ''}`,
        }},
      },
    },
  });
}

// ── Tableau par catégorie ─────────────────────────────────
function renderCatTable(articles) {
  const cats = {};
  articles.filter(a => a.statut === 'vendu').forEach(a => {
    const c = a.categorie || 'Autre';
    if (!cats[c]) cats[c] = { marges: [], durees: [], count: 0 };
    cats[c].marges.push(a.marge);
    cats[c].count++;
    if (a.date_achat && a.date_vente) {
      cats[c].durees.push(Math.round(
        (new Date(a.date_vente) - new Date(a.date_achat)) / 86400000
      ));
    }
  });

  const tbody = document.querySelector('#cat-table tbody');
  if (!Object.keys(cats).length) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--text-muted);text-align:center;padding:16px">Aucune vente</td></tr>`;
    return;
  }

  const rows = Object.entries(cats)
    .map(([cat, d]) => ({
      cat,
      count: d.count,
      marge: +(d.marges.reduce((s, v) => s + v, 0) / d.marges.length).toFixed(1),
      temps: d.durees.length
        ? Math.round(d.durees.reduce((s, v) => s + v, 0) / d.durees.length) : null,
    }))
    .sort((a, b) => b.marge - a.marge);

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><span class="cat-badge cat-${esc(r.cat)}">${esc(r.cat)}</span></td>
      <td>${r.count}</td>
      <td class="${r.marge >= 0 ? 'green' : 'red'}">${r.marge} %</td>
      <td>${r.temps != null ? r.temps + ' j' : '—'}</td>
    </tr>`).join('');
}

// ── Top 5 meilleurs / pires ───────────────────────────────
function renderTopTables(articles) {
  const vendus = articles.filter(a => a.statut === 'vendu');
  if (!vendus.length) {
    ['top5-best', 'top5-worst'].forEach(id => {
      document.querySelector(`#${id} tbody`).innerHTML =
        `<tr><td colspan="3" style="color:var(--text-muted);text-align:center;padding:16px">Aucune vente</td></tr>`;
    });
    return;
  }

  const sorted = [...vendus].sort((a, b) => b.marge - a.marge);
  const best  = sorted.slice(0, 5);
  const worst = sorted.slice(-5).reverse();

  function tableRows(list) {
    return list.map(a => `
      <tr>
        <td class="nom-cell">${esc(a.nom)}</td>
        <td class="${a.marge >= 0 ? 'green' : 'red'}">${a.marge} %</td>
        <td class="${a.benefice_net >= 0 ? 'green' : 'red'}">${fmt(a.benefice_net)} €</td>
      </tr>`).join('');
  }

  document.querySelector('#top5-best  tbody').innerHTML = tableRows(best);
  document.querySelector('#top5-worst tbody').innerHTML = tableRows(worst);
}
