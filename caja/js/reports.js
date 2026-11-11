// reports.js — pantalla de Reportes: filtros, vistas, gráfica, tabla, CSV, impresión y vistas guardadas.
// Los cálculos están en reports-store.js; aquí solo se dibuja. Los reportes se recalculan con las ventas
// reales cada vez que cambias un filtro. Columnas, gráfica y vistas se configuran en "Personalizar".
import { mountDemoBanner } from './demo-banner.js';
import * as sales from './sales-store.js';
import * as catalog from './catalog-store.js';
import * as expenseStore from './expenses-store.js';
import { runReport, presetRange, toCsv, pickColumns, utilityInfo, SUMMARY_CARDS, REPORT_VIEWS, GROUPS, PRESETS, isExpenseView } from './reports-store.js';
import { renderReportsEditor, setColumns, chartKind, validateViewName } from './reports-editor.js';
import { dateKey, monthStart, prevMonthStart, lastDayOfMonth } from './dashboard-store.js';
import { getConfig, updateConfig } from './state.js';
import { emptyState, toast, promptDialog } from './components.js';
import { barChartSvg, rankBarsHtml, donutHtml } from './charts.js';
import { escapeHtml, money, formatDateTime, download, uid } from './utilities.js';
import { renderHistory } from './sales-history.js';

const dmyKey = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;

const STATUS = { all: 'Todas', completed: 'Completadas', cancelled: 'Canceladas' };
const STATUS_EXPENSE = { all: 'Todos', completed: 'Activos', cancelled: 'Cancelados' }; // en reportes de gastos
const statusLabels = () => (isExpenseView(ui.view) ? STATUS_EXPENSE : STATUS);
const MAX_ROWS = 200;
const MAX_VIEWS = 20;

// Los filtros se conservan mientras la app esté abierta; las vistas guardadas sí sobreviven al cerrar.
// Pestañas de Reportes: cada una abre una vista que ya existía ('history' es la lista de ventas de sales-history.js).
const TABS = [['history', 'Historial de ventas'], ['expenseDetail', 'Historial de gastos'], ['method', 'Por método de pago'],
  ['category', 'Ventas por categoría'], ['expenseCategory', 'Gastos por categoría'], ['summary', 'Totales'], ['period', 'Totales por periodo']];
const ui = { mode: 'report', view: 'history', group: 'day', preset: 'month', from: '', to: '', productId: '', categoryId: '', expenseCategoryId: '', method: '', status: 'all' };
let started = false;
let root = null;
let allSales = [];
let products = [];
let cats = [];
let expenses = [];
let expenseCats = [];
let current = null; // último resultado calculado
let onResize = null;

export async function render(container) {
  root = container;
  ui.mode = 'report';
  [allSales, products, cats, expenses, expenseCats] = await Promise.all([
    sales.listSales(), catalog.listProducts(), catalog.listCategories(),
    expenseStore.listExpenses(), expenseStore.listExpenseCategories()
  ]);
  if (!allSales.length && !expenses.length) {
    root.innerHTML = `<header class="page-head"><h1>Reportes</h1><p class="muted">Ventas, productos y métodos de pago</p></header>` + emptyState({
      icon: 'list', title: 'Aún no hay datos para reportar',
      text: 'Cuando registres ventas podrás ver reportes por periodo, producto, categoría y método de pago, y exportarlos a CSV.',
      actionId: 'go-sales', actionLabel: 'Ir a Ventas'
    });
    root.querySelector('#go-sales').addEventListener('click', () => { location.hash = '#/ventas'; });
    return;
  }
  if (!started) { started = true; ui.preset = getConfig().reports.defaultPreset; } // el periodo predeterminado aplica al abrir
  applyPreset(ui.preset, getConfig().timezone);
  draw();
  onResize = (() => { let t; return () => { clearTimeout(t); t = setTimeout(drawChart, 200); }; })();
  window.addEventListener('resize', onResize);
}

export function destroy() {
  if (onResize) window.removeEventListener('resize', onResize);
  onResize = null;
}

function applyPreset(preset, tz) {
  ui.preset = preset;
  const range = presetRange(preset, dateKey(new Date().toISOString(), tz), { monthStart, prevMonthStart, lastDayOfMonth });
  if (range) { ui.from = range.from; ui.to = range.to; }
}

const filters = () => ({ from: ui.from, to: ui.to, productId: ui.productId, categoryId: ui.categoryId, expenseCategoryId: ui.expenseCategoryId, method: ui.method, status: ui.status });
const viewNames = () => Object.fromEntries(TABS);
const columnIds = (view) => (view === 'summary' ? getConfig().reports.summaryCards : getConfig().reports.columns[view]);

/* ---------- Vistas guardadas ---------- */

async function saveCurrentView() {
  const rep = getConfig().reports;
  if (rep.views.length >= MAX_VIEWS) { toast(`Puedes guardar hasta ${MAX_VIEWS} vistas. Elimina alguna en Personalizar.`, 'error'); return; }
  const name = await promptDialog({
    title: 'Guardar vista', message: 'Guarda estos filtros, columnas y gráfica para volver a usarlos con un toque.',
    label: 'Nombre de la vista', confirmText: 'Guardar', validate: (t) => validateViewName(rep.views, t)
  });
  if (name === null) return;
  const ids = columnIds(ui.view);
  const view = {
    id: uid(), name: name.trim(), view: ui.view, group: ui.group, preset: ui.preset, from: ui.from, to: ui.to,
    productId: ui.productId, categoryId: ui.categoryId, expenseCategoryId: ui.expenseCategoryId, method: ui.method, status: ui.status,
    columns: Array.isArray(ids) ? [...ids] : null, chart: chartKind(ui.view) ? rep.chart[ui.view] : null
  };
  try {
    await updateConfig((c) => { c.reports.views = [...c.reports.views, view]; });
    toast('Vista guardada', 'ok');
    draw();
  } catch (err) { toast('No se pudo guardar la vista: ' + err.message, 'error'); }
}

async function applySavedView(id) {
  const v = getConfig().reports.views.find((x) => x.id === id);
  if (!v) return;
  ui.view = REPORT_VIEWS[v.view] ? v.view : 'summary';
  ui.group = GROUPS[v.group] ? v.group : 'day';
  ui.productId = products.some((p) => p.id === v.productId) ? v.productId : '';
  ui.categoryId = v.categoryId === 'none' || cats.some((c) => c.id === v.categoryId) ? v.categoryId : '';
  ui.expenseCategoryId = expenseCats.some((c) => c.id === v.expenseCategoryId) ? v.expenseCategoryId : '';
  ui.method = v.method || '';
  ui.status = STATUS[v.status] ? v.status : 'all';
  if (v.preset && v.preset !== 'custom' && PRESETS[v.preset]) applyPreset(v.preset, getConfig().timezone);
  else { ui.preset = 'custom'; ui.from = v.from || ''; ui.to = v.to || ''; }
  try {
    await updateConfig((c) => {
      setColumns(c, ui.view, v.columns);
      if (v.chart && chartKind(ui.view)) c.reports.chart[ui.view] = v.chart;
    });
  } catch (err) { toast('No se pudo aplicar la vista: ' + err.message, 'error'); }
  draw();
  toast(`Vista “${v.name}” aplicada`, 'ok');
}

/* ---------- Estructura y filtros ---------- */

function methodOptions() {
  const cfg = getConfig();
  const used = [...allSales.flatMap((s) => (s.payments || []).map((p) => p.method)), ...expenses.map((e) => e.method)];
  return [...new Set(['Efectivo', ...cfg.sales.otherMethods, ...used.filter(Boolean)])];
}

// Dibuja la pantalla y, si hay datos de PRUEBA cargados, muestra el aviso para no confundirlos con ventas reales.
function draw() {
  drawScreen();
  if (ui.mode !== 'editor') mountDemoBanner(root, () => render(root));
}

function drawScreen() {
  if (ui.mode === 'editor') {
    renderReportsEditor(root, { view: ui.view, group: ui.group, onBack: () => { ui.mode = 'report'; draw(); } });
    return;
  }
  const opt = (value, label, sel) => `<option value="${escapeHtml(value)}" ${value === sel ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const views = getConfig().reports.views;
  root.innerHTML = `
    <header class="page-head row between no-print">
      <div><h1>Reportes</h1><p class="muted">Se calculan con tus ventas reales</p></div>
      <div class="row">
        <select id="r-saved" class="input" aria-label="Vistas guardadas" style="width:auto;max-width:100%" ${views.length ? '' : 'disabled'}>
          <option value="">${views.length ? 'Vistas guardadas…' : 'Sin vistas guardadas'}</option>${views.map((v) => opt(v.id, v.name, '')).join('')}</select>
        <button class="btn" id="r-save" type="button">Guardar vista</button>
        <button class="btn" id="r-custom" type="button">Personalizar</button>
        <button class="btn" id="r-csv" type="button">Exportar CSV</button>
        <button class="btn" id="r-print" type="button">Imprimir / PDF</button>
      </div>
    </header>

    <details class="card filters no-print" id="r-filters">
      <summary class="filters-summary">
        <span class="filters-summary-main">
          <strong>Filtros</strong>
          <span class="filters-chevron" aria-hidden="true"></span>
        </span>
        <span class="filters-summary-hint muted small" id="r-filter-brief"></span>
      </summary>
      <div class="filters-body form-grid">
        <div class="field"><label for="r-preset">Periodo</label><select id="r-preset" class="input">
          ${Object.entries(PRESETS).map(([k, l]) => opt(k, l, ui.preset)).join('')}</select></div>
        <div class="field"><label for="r-from">Desde</label><input id="r-from" type="date" class="input" value="${ui.from}"></div>
        <div class="field"><label for="r-to">Hasta</label><input id="r-to" type="date" class="input" value="${ui.to}"></div>
        <div class="field" data-sales-only ${isExpenseView(ui.view) ? 'hidden' : ''}><label for="r-prod">Producto</label><select id="r-prod" class="input">
          ${opt('', 'Todos los productos', ui.productId)}${[...products].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => opt(p.id, p.name + (p.active ? '' : ' (archivado)'), ui.productId)).join('')}</select></div>
        <div class="field" data-sales-only ${isExpenseView(ui.view) ? 'hidden' : ''}><label for="r-cat">Categoría</label><select id="r-cat" class="input">
          ${opt('', 'Todas las categorías', ui.categoryId)}${opt('none', 'Sin categoría', ui.categoryId)}${cats.map((c) => opt(c.id, `${c.icon} ${c.name}`, ui.categoryId)).join('')}</select></div>
        <div class="field" data-expense-only ${isExpenseView(ui.view) ? '' : 'hidden'}><label for="r-ecat">Categoría de gasto</label><select id="r-ecat" class="input">
          ${opt('', 'Todas las categorías de gasto', ui.expenseCategoryId)}${expenseCats.map((c) => opt(c.id, `${c.icon} ${c.name}`, ui.expenseCategoryId)).join('')}</select></div>
        <div class="field"><label for="r-method">Método de pago</label><select id="r-method" class="input">
          ${opt('', 'Todos los métodos', ui.method)}${methodOptions().map((m) => opt(m, m, ui.method)).join('')}</select></div>
        <div class="field"><label for="r-status" id="r-status-label">${isExpenseView(ui.view) ? 'Estado del gasto' : 'Estado de la venta'}</label><select id="r-status" class="input">
          ${Object.entries(statusLabels()).map(([k, l]) => opt(k, l, ui.status)).join('')}</select></div>
      </div>
      <p class="hint" id="r-hint" style="margin-top:10px"></p>
    </details>

    <div class="chips no-print" id="r-views" role="group" aria-label="Tipo de reporte" style="margin-top:16px">
      ${Object.entries(viewNames()).map(([k, l]) => `<button type="button" class="chip" data-view="${k}" aria-pressed="${k === ui.view}">${l}</button>`).join('')}
    </div>
    <div class="chips no-print" id="r-groups" role="group" aria-label="Agrupar por" ${ui.view === 'period' ? '' : 'hidden'}>
      ${Object.entries(GROUPS).map(([k, l]) => `<button type="button" class="chip" data-group="${k}" aria-pressed="${k === ui.group}">${l}</button>`).join('')}
    </div>

    <div class="print-only" id="r-printhead"></div>
    <div id="rep"></div>`;

  const $ = (s) => root.querySelector(s);
  $('#r-preset').addEventListener('change', (e) => {
    applyPreset(e.target.value, getConfig().timezone);
    $('#r-from').value = ui.from; $('#r-to').value = ui.to;
    refresh();
  });
  const dateChange = () => { ui.preset = 'custom'; $('#r-preset').value = 'custom'; ui.from = $('#r-from').value; ui.to = $('#r-to').value; refresh(); };
  $('#r-from').addEventListener('change', dateChange);
  $('#r-to').addEventListener('change', dateChange);
  [['#r-prod', 'productId'], ['#r-cat', 'categoryId'], ['#r-ecat', 'expenseCategoryId'], ['#r-method', 'method'], ['#r-status', 'status']].forEach(([sel, key]) =>
    $(sel).addEventListener('change', (e) => { ui[key] = e.target.value; refresh(); }));
  $('#r-views').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]')?.dataset.view;
    if (!v) return;
    ui.view = v;
    root.querySelectorAll('#r-views .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    $('#r-groups').hidden = v !== 'period';
    syncFilters();
    syncHistory();
    refresh();
  });
  $('#r-groups').addEventListener('click', (e) => {
    const g = e.target.closest('[data-group]')?.dataset.group;
    if (!g) return;
    ui.group = g;
    root.querySelectorAll('#r-groups .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.group === g)));
    refresh();
  });
  // Los reportes de gastos usan otros filtros (categoría de gasto) y otros nombres de estado.
  // La lista de ventas tiene su propio buscador y estado: sin filtros ni botones de reporte.
  function syncHistory() {
    const h = ui.view === 'history';
    $('#r-filters').hidden = h;
    ['#r-saved', '#r-save', '#r-custom', '#r-csv', '#r-print'].forEach((id) => { $(id).hidden = h; });
  }
  function syncFilters() {
    const exp = isExpenseView(ui.view);
    root.querySelectorAll('[data-sales-only]').forEach((el) => { el.hidden = exp; });
    root.querySelectorAll('[data-expense-only]').forEach((el) => { el.hidden = !exp; });
    $('#r-status-label').textContent = exp ? 'Estado del gasto' : 'Estado de la venta';
    [...$('#r-status').options].forEach((o) => { o.textContent = statusLabels()[o.value]; });
  }
  $('#r-saved').addEventListener('change', (e) => { if (e.target.value) applySavedView(e.target.value); });
  $('#r-save').addEventListener('click', saveCurrentView);
  $('#r-custom').addEventListener('click', () => { ui.mode = 'editor'; draw(); window.scrollTo(0, 0); });
  $('#r-csv').addEventListener('click', exportCsv);
  $('#r-print').addEventListener('click', () => window.print());
  syncHistory();
  refresh();
}

/* ---------- Cálculo y dibujo del resultado ---------- */

function describeFilters() {
  const pName = products.find((p) => p.id === ui.productId)?.name;
  const cName = ui.categoryId === 'none' ? 'Sin categoría' : cats.find((c) => c.id === ui.categoryId)?.name;
  const dmy = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '…');
  const eName = expenseCats.find((c) => c.id === ui.expenseCategoryId)?.name;
  const exp = isExpenseView(ui.view);
  return [`Periodo: ${dmy(ui.from)} al ${dmy(ui.to)}`, !exp && pName && `Producto: ${pName}`, !exp && cName && `Categoría: ${cName}`, exp && eName && `Categoría de gasto: ${eName}`,
    ui.method && `Método: ${ui.method}`, `Estado: ${statusLabels()[ui.status]}`].filter(Boolean).join(' · ');
}

function refresh() {
  const rep = root.querySelector('#rep');
  const hint = root.querySelector('#r-hint');
  const brief = root.querySelector('#r-filter-brief');
  if (brief) brief.textContent = describeFilters();
  hint.textContent = isExpenseView(ui.view)
    ? 'Los reportes de gastos usan la fecha del gasto, el método de pago y la categoría de gasto. Los cancelados se muestran aparte y no suman.'
    : ui.method
    ? 'Con un método de pago elegido se incluyen las ventas que lo usaron, aunque hayan pagado una parte con otro método.'
    : (ui.productId || ui.categoryId ? 'Con producto o categoría, los importes corresponden solo a esos artículos (el descuento de cada venta se reparte entre sus artículos). Los gastos no se incluyen.' : '');
  root.querySelector('#r-printhead').innerHTML = `<h2>${escapeHtml(getConfig().business.name)}</h2>
    <p><strong>Reporte: ${REPORT_VIEWS[ui.view]}${ui.view === 'period' ? ' · por ' + GROUPS[ui.group].toLowerCase() : ''}</strong></p>
    <p>${escapeHtml(describeFilters())}</p><p>Generado: ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>`;

  if (ui.view === 'history') { // lista de ventas con búsqueda, reimpresión y cancelación (sales-history.js)
    current = null;
    hint.textContent = '';
    root.querySelector('#r-printhead').innerHTML = '';
    renderHistory(rep);
    return;
  }
  if (ui.from && ui.to && ui.from > ui.to) {
    current = null;
    rep.innerHTML = `<div class="notice warn" style="margin-top:16px" role="alert">La fecha inicial es posterior a la final. Corrige el rango para ver resultados.</div>`;
    return;
  }
  current = runReport(allSales, filters(), { timeZone: getConfig().timezone, view: ui.view, group: ui.group, columnIds: columnIds(ui.view), expenses });
  if (!current.matched) {
    rep.innerHTML = `<div class="card empty" style="margin-top:16px"><h2>Sin resultados</h2><p>Ningún registro coincide con estos filtros. Prueba con otro periodo o quita algún filtro.</p></div>`;
    return;
  }
  rep.innerHTML = ui.view === 'summary' ? summaryHtml(current.summary) : tableViewHtml(current.table);
  drawChart();
}

const fmtCell = (v, type) => {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'money') return money(v);
  if (type === 'pct') return `${Number(v).toFixed(1)}%`;
  if (type === 'qty') return String(+Number(v).toFixed(3));
  if (type === 'int') return String(v);
  if (type === 'datetime') return escapeHtml(formatDateTime(v));
  if (type === 'date') return escapeHtml(dmyKey(String(v)));
  return escapeHtml(v);
};

function summaryHtml(s) {
  const kpi = (label, value, sub = '') => `<div class="card kpi"><span class="muted small">${label}</span><strong class="kpi-value">${value}</strong>${sub}</div>`;
  const note = (t) => `<span class="muted small">${t}</span>`;
  const u = utilityInfo(s, money);
  const cards = {
    gross: () => kpi('Ventas brutas', money(s.gross), note('Antes de descuentos')),
    discount: () => kpi('Descuentos', money(s.discount)),
    net: () => kpi('Ventas netas', money(s.net), note('Brutas − descuentos')),
    ops: () => kpi('Operaciones', String(s.ops)),
    avg: () => kpi('Ticket promedio', money(s.avg)),
    cancelled: () => kpi('Ventas canceladas', String(s.cancelledOps), note(`${money(s.cancelledAmount)} · no se suman ni se restan de las netas`)),
    utility: () => kpi(u.label, u.value, note(u.note)),
    expenses: () => (s.expenses
      ? kpi('Gastos', money(s.expenses.total), note(`${s.expenses.count} gasto(s)${s.expenses.cancelled ? ` · ${s.expenses.cancelled} cancelado(s) no suman` : ''}`))
      : kpi('Gastos', '—', note('No aplica con filtro de producto, categoría o estado “canceladas”.'))),
    result: () => (s.result !== null
      ? kpi('Ventas menos gastos', `<span class="${s.result < 0 ? 'neg' : ''}">${money(s.result)}</span>`, note('Ventas netas − gastos. No es la utilidad: no resta el costo de los productos.'))
      : kpi('Ventas menos gastos', '—', note('Se calcula solo sin filtros de producto, categoría ni método de pago.')))
  };
  const shown = pickColumns(SUMMARY_CARDS, getConfig().reports.summaryCards, { lockFirst: false });
  return `<div class="kpis" style="margin-top:16px">${shown.map((c) => cards[c.id]()).join('')}</div>
    <p class="muted small" style="margin-top:12px">Las ventas canceladas se muestran aparte. Por ahora la app no registra devoluciones, solo cancelaciones completas.</p>`;
}

function tableViewHtml(t) {
  const shown = t.rows.slice(0, MAX_ROWS);
  const cls = (c) => (c.type === 'text' || c.type === 'datetime' ? '' : 'num');
  const head = t.columns.map((c) => `<th scope="col" class="${cls(c)}">${escapeHtml(c.label)}</th>`).join('');
  const body = shown.map((r) => `<tr>${t.columns.map((c) => `<td class="${cls(c)}">${fmtCell(r[c.id], c.type)}</td>`).join('')}</tr>`).join('');
  const foot = t.totals ? `<tr>${t.columns.map((c, i) => `<th class="${cls(c)}">${fmtCell(t.totals[c.id] ?? (i === 0 ? 'Total' : null), c.type)}</th>`).join('')}</tr>` : '';
  const showChart = t.chart && getConfig().reports.chart[ui.view] !== 'none';
  return `${showChart ? '<section class="card" style="margin-top:16px"><div id="r-chart"></div></section>' : ''}
    <section class="card" style="margin-top:16px">
      <div class="table-wrap"><table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
      ${t.rows.length > MAX_ROWS ? `<p class="muted small" style="margin-top:10px">Mostrando ${MAX_ROWS} de ${t.rows.length} filas. Exporta a CSV para verlas todas.</p>` : ''}
    </section>`;
}

function drawChart() {
  const host = root?.querySelector('#r-chart');
  const chart = current?.table?.chart;
  if (!host || !chart) return;
  const mode = getConfig().reports.chart[ui.view];
  if (chart.type === 'bars') {
    const n = chart.values.length;
    const step = Math.max(1, Math.ceil(n / 8));
    host.innerHTML = barChartSvg({ type: mode === 'line' ? 'line' : 'bars', labels: chart.labels, full: chart.full, current: chart.values, show: chart.values.map((_, i) => i % step === 0) }, host.clientWidth || 600);
  } else if (!chart.items.length) {
    host.innerHTML = '<p class="muted">Sin ventas completadas para graficar.</p>';
  } else {
    host.innerHTML = mode === 'donut' ? donutHtml(chart.items) : `<div class="stack">${rankBarsHtml(chart.items)}</div>`;
  }
}

/* ---------- Exportar ---------- */

function exportCsv() {
  if (!current) { toast('Corrige los filtros para poder exportar', 'error'); return; }
  const result = ui.view === 'summary'
    ? runReport(allSales, filters(), { timeZone: getConfig().timezone, view: 'period', group: 'day', columnIds: getConfig().reports.columns.period })
    : current;
  if (!result.table || !result.table.rows.length) { toast('No hay datos para exportar con estos filtros', 'error'); return; }
  const name = ui.view === 'summary' ? 'resumen-por-dia' : ui.view + (ui.view === 'period' ? '-' + ui.group : '');
  const csv = '\uFEFF' + toCsv(result.table, { datetime: formatDateTime });
  download(`reporte-${name}_${ui.from || 'inicio'}_${ui.to || 'hoy'}.csv`, csv, 'text/csv');
  toast(ui.view === 'summary' ? 'Exportado el detalle por día del resumen' : 'CSV exportado', 'ok');
}
