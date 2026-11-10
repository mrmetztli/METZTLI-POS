// reports-editor.js — pantalla "Personalizar reporte": columnas (mostrar/ocultar/ordenar), tipo de gráfica,
// periodo predeterminado y vistas guardadas. Cada cambio se guarda al instante.
import { getConfig, updateConfig, DEFAULT_CONFIG } from './state.js';
import { viewColumns, columnsForEditor, REPORT_VIEWS, GROUPS, PRESETS } from './reports-store.js';
import { mountOrderEditor, confirmDialog, promptDialog, toast, pageHeader } from './components.js';
import { escapeHtml } from './utilities.js';

// Tipos de gráfica compatibles con cada reporte
export const CHART_OPTIONS = {
  period: [['bars', 'Barras'], ['line', 'Líneas'], ['none', 'Sin gráfica']],
  rank: [['rank', 'Barras horizontales'], ['donut', 'Dona'], ['none', 'Sin gráfica']]
};
export const chartKind = (view) => (view === 'period' ? 'period' : ['product', 'category', 'method', 'expenseCategory'].includes(view) ? 'rank' : null);

// Guarda las columnas elegidas de un reporte (null = todas, en su orden por defecto)
export function setColumns(c, view, ids) {
  if (view === 'summary') c.reports.summaryCards = ids;
  else c.reports.columns[view] = ids;
}

async function save(mutator) {
  try { await updateConfig(mutator); } catch (err) { toast('No se pudo guardar: ' + err.message, 'error'); }
}

const viewNameOk = (views, text, exceptId) => {
  const t = text.trim();
  if (!t) return 'Escribe un nombre.';
  if (t.length > 40) return 'Máximo 40 caracteres.';
  if (views.some((x) => x.id !== exceptId && x.name.toLowerCase() === t.toLowerCase())) return 'Ya existe una vista con ese nombre.';
  return '';
};
export const validateViewName = viewNameOk;

export function renderReportsEditor(root, { view, group, onBack }) {
  const rep = getConfig().reports;
  const isSummary = view === 'summary';
  const all = viewColumns(view, group);
  const ids = isSummary ? rep.summaryCards : rep.columns[view];
  const kind = chartKind(view);
  const opt = (v, l, cur) => `<option value="${escapeHtml(v)}" ${v === cur ? 'selected' : ''}>${escapeHtml(l)}</option>`;

  root.innerHTML = pageHeader(`Personalizar: ${REPORT_VIEWS[view]}`, 'Elige qué columnas ver y en qué orden. Se guarda solo y también se aplica al exportar a CSV.') + `
    <div class="row" style="margin-bottom:16px"><button class="btn btn-primary" id="re-back" type="button">← Listo, volver a Reportes</button></div>
    <section class="editor-section"><h2>${isSummary ? 'Tarjetas del resumen' : 'Columnas'}</h2>
      <p class="muted small">${isSummary ? 'Marca las métricas que quieres ver y ordénalas con ↑ ↓.' : 'La primera columna siempre se muestra. Marca las demás y ordénalas con ↑ ↓.'}</p>
      <div id="re-cols"></div></section>
    ${kind ? `<section class="editor-section"><h2>Gráfica</h2><div class="card form-grid"><div class="field">
        <label for="re-chart">Tipo de gráfica de este reporte</label><select id="re-chart" class="input">
        ${CHART_OPTIONS[kind].map(([v, l]) => opt(v, l, rep.chart[view])).join('')}</select></div></div></section>` : ''}
    <section class="editor-section"><h2>Periodo predeterminado</h2><div class="card form-grid"><div class="field">
      <label for="re-preset">Reportes abre con</label><select id="re-preset" class="input">
      ${Object.entries(PRESETS).filter(([k]) => k !== 'custom').map(([k, l]) => opt(k, l, rep.defaultPreset)).join('')}</select></div></div></section>
    <section class="editor-section"><h2>Vistas guardadas</h2><div id="re-views" class="stack"></div></section>
    <section class="editor-section"><h2>Restaurar</h2>
      <div><button class="btn" id="re-reset" type="button">Restaurar este reporte a sus valores predeterminados</button></div></section>`;

  mountOrderEditor(root.querySelector('#re-cols'), {
    items: columnsForEditor(all, ids, { lockFirst: !isSummary }).map((c) => ({ id: c.id, label: c.label, enabled: c.enabled, locked: !isSummary && c.id === all[0].id })),
    onChange: (list) => {
      const chosen = list.filter((x) => x.enabled).map((x) => x.id);
      const same = chosen.length === all.length && chosen.every((id, i) => id === all[i].id);
      save((c) => setColumns(c, view, same ? null : chosen));
    }
  });

  root.querySelector('#re-back').addEventListener('click', onBack);
  root.querySelector('#re-chart')?.addEventListener('change', (e) => save((c) => { c.reports.chart[view] = e.target.value; }));
  root.querySelector('#re-preset').addEventListener('change', (e) => save((c) => { c.reports.defaultPreset = e.target.value; }));

  // Vistas guardadas: renombrar y eliminar (aplicarlas se hace desde la pantalla de Reportes)
  const drawViews = () => {
    const views = getConfig().reports.views;
    root.querySelector('#re-views').innerHTML = views.length
      ? views.map((v) => `<div class="card row between" data-id="${v.id}"><span><strong>${escapeHtml(v.name)}</strong><br>
          <span class="muted small">${REPORT_VIEWS[v.view] || v.view}${v.view === 'period' ? ' · por ' + (GROUPS[v.group] || '').toLowerCase() : ''} · ${v.preset === 'custom' ? 'fechas fijas' : (PRESETS[v.preset] || '')}</span></span>
          <span class="row"><button class="btn btn-sm" data-act="rename" type="button">Renombrar</button><button class="btn btn-sm" data-act="delete" type="button">Eliminar</button></span></div>`).join('')
      : '<p class="muted">Aún no guardas ninguna vista. En Reportes, ajusta filtros y columnas y pulsa “Guardar vista”.</p>';
  };
  drawViews();
  root.querySelector('#re-views').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = e.target.closest('[data-id]')?.dataset.id;
    const v = getConfig().reports.views.find((x) => x.id === id);
    if (!act || !v) return;
    if (act === 'rename') {
      const name = await promptDialog({ title: 'Renombrar vista', label: 'Nuevo nombre', value: v.name, confirmText: 'Guardar', validate: (t) => viewNameOk(getConfig().reports.views, t, id) });
      if (name === null) return;
      await save((c) => { c.reports.views.find((x) => x.id === id).name = name.trim(); });
    } else {
      const yes = await confirmDialog({ title: `¿Eliminar la vista “${v.name}”?`, message: 'Solo se borra la vista guardada; tus ventas no se tocan.', confirmText: 'Eliminar', danger: true });
      if (!yes) return;
      await save((c) => { c.reports.views = c.reports.views.filter((x) => x.id !== id); });
    }
    drawViews();
  });

  root.querySelector('#re-reset').addEventListener('click', async () => {
    const yes = await confirmDialog({ title: '¿Restaurar este reporte?', message: 'Volverán todas las columnas en su orden original y la gráfica predeterminada. Tus vistas guardadas no se borran.', confirmText: 'Restaurar' });
    if (!yes) return;
    await save((c) => {
      setColumns(c, view, null);
      if (kind) c.reports.chart[view] = DEFAULT_CONFIG.reports.chart[view];
    });
    toast('Reporte restaurado', 'ok');
    renderReportsEditor(root, { view, group, onBack });
  });
}
