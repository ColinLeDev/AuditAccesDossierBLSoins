/*
 * Export CSV des traces d'accès par utilisateur, filtré sur un dossier.
 * À coller dans la console du navigateur, sur la page contenant la table
 * dont l'id commence par "table-liste-traces".
 *
 * CSV produit (séparateur ";" + BOM UTF-8 pour Excel) :
 *   Utilisateur ; Nombre d'accès ; Premier accès ; Dernier accès
 */
(() => {
  const KEYS = {
    date: 'sante.soins:liste-traces.date',
    user: 'sante.soins:liste-traces.utilisateur',
    dossier: 'sante.soins:liste-traces.dossier',
  };
  const PANEL_ID = 'export-traces-panel';
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Dates FR "jj/mm/aaaa [hh:mm[:ss]]" (aussi "-", "." ou "h"), sinon ISO
  const parseDate = (s) => {
    const m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\D+(\d{1,2})[:h](\d{2})(?::(\d{2}))?)?/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : NaN;
  };

  // --- Lecture de la (ou des) table(s) ---
  const tables = [...document.querySelectorAll('table[id^="table-liste-traces"]')];
  if (!tables.length) {
    console.error('❌ Aucune table dont l\'id commence par "table-liste-traces".');
    return;
  }

  const rows = [];
  let order = 0;
  for (const table of tables) {
    const ths = [...table.querySelectorAll('thead th')];
    const idx = {};
    for (const [k, key] of Object.entries(KEYS)) {
      idx[k] = ths.findIndex((th) => (th.getAttribute('i18n') || '').includes(key));
    }
    if (Object.values(idx).some((i) => i < 0)) {
      console.warn('⚠️ Colonnes introuvables dans', table.id, idx);
      continue;
    }
    const maxIdx = Math.max(...Object.values(idx));
    for (const tr of table.querySelectorAll('tbody tr')) {
      const cells = tr.querySelectorAll(':scope > td, :scope > th');
      if (cells.length <= maxIdx) continue; // ligne vide / "aucun résultat"
      const date = clean(cells[idx.date].textContent);
      rows.push({
        date,
        ts: parseDate(date),
        order: order++,
        user: clean(cells[idx.user].textContent),
        dossier: clean(cells[idx.dossier].textContent),
      });
    }
  }

  if (!rows.length) {
    console.error('❌ Aucune ligne de trace lue dans la table.');
    return;
  }
  console.log(`✅ ${rows.length} trace(s) lue(s).`);

  // --- Agrégation par utilisateur ---
  const aggregate = (list) => {
    const byUser = new Map();
    for (const r of list) {
      let a = byUser.get(r.user);
      if (!a) {
        a = { user: r.user, count: 0, first: r, last: r };
        byUser.set(r.user, a);
      }
      a.count++;
      // Comparaison par date si lisible, sinon par ordre d'apparition
      const key = (x) => (Number.isFinite(x.ts) ? x.ts : null);
      const before = (x, y) => (key(x) !== null && key(y) !== null ? key(x) < key(y) : x.order > y.order);
      if (before(r, a.first)) a.first = r;
      if (before(a.last, r)) a.last = r;
    }
    return [...byUser.values()].sort((a, b) => b.count - a.count || a.user.localeCompare(b.user, 'fr'));
  };

  const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const toCSV = (agg) =>
    [
      ['Utilisateur', "Nombre d'accès", 'Premier accès', 'Dernier accès'],
      ...agg.map((a) => [a.user, a.count, a.first.date, a.last.date]),
    ]
      .map((line) => line.map(csvCell).join(';'))
      .join('\r\n');

  const download = (content, filename) => {
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  const slug = (s) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'dossier';

  // --- Interface de choix du dossier ---
  document.getElementById(PANEL_ID)?.remove();

  const counts = new Map();
  for (const r of rows) counts.set(r.dossier, (counts.get(r.dossier) || 0) + 1);
  const dossiers = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
  const ALL = '__ALL__';

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText =
    'position:fixed;top:20px;right:20px;z-index:2147483647;width:420px;max-width:90vw;' +
    'background:#fff;color:#222;border:1px solid #999;border-radius:8px;padding:14px;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.25);font:14px/1.4 system-ui,sans-serif;';
  panel.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px">Export des traces par dossier</div>
    <div style="margin-bottom:6px;color:#555">${rows.length} trace(s), ${dossiers.length} dossier(s)</div>
    <input type="search" placeholder="Rechercher un dossier…" style="width:100%;box-sizing:border-box;padding:5px;margin-bottom:6px">
    <select size="10" style="width:100%;box-sizing:border-box;padding:3px"></select>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button type="button" data-act="close" style="padding:5px 12px">Fermer</button>
      <button type="button" data-act="export" style="padding:5px 12px;font-weight:600">Exporter CSV</button>
    </div>`;
  document.body.appendChild(panel);

  const search = panel.querySelector('input');
  const select = panel.querySelector('select');

  const fill = (q = '') => {
    const ql = q.toLowerCase();
    select.innerHTML = '';
    if (!ql) select.add(new Option(`— Tous les dossiers — (${rows.length})`, ALL));
    for (const d of dossiers) {
      if (ql && !d.toLowerCase().includes(ql)) continue;
      select.add(new Option(`${d || '(vide)'} (${counts.get(d)})`, d));
    }
    if (select.options.length) select.selectedIndex = 0;
  };
  fill();
  search.addEventListener('input', () => fill(search.value));

  const doExport = () => {
    if (select.selectedIndex < 0) return alert('Choisissez un dossier.');
    const choice = select.value;
    const list = choice === ALL ? rows : rows.filter((r) => r.dossier === choice);
    const agg = aggregate(list);
    console.table(agg.map((a) => ({
      Utilisateur: a.user, "Nombre d'accès": a.count, 'Premier accès': a.first.date, 'Dernier accès': a.last.date,
    })));
    const today = new Date().toISOString().slice(0, 10);
    download(toCSV(agg), `traces_${choice === ALL ? 'tous' : slug(choice)}_${today}.csv`);
  };

  select.addEventListener('dblclick', doExport);
  panel.querySelector('[data-act="export"]').addEventListener('click', doExport);
  panel.querySelector('[data-act="close"]').addEventListener('click', () => panel.remove());
})();
