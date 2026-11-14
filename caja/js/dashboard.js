// dashboard.js — pantalla del Dashboard. Los cálculos están en dashboard-store.js;
// aquí solo se dibuja. Qué bloques se ven, en qué orden y con qué tamaño lo decide Configuración
// del dashboard (botón "Personalizar"); todo sale de las ventas reales guardadas.
import { mountDemoBanner } from './demo-banner.js';
import * as sales from './sales-store.js';
import * as catalog from './catalog-store.js';
import * as expenseStore from './expenses-store.js';
import { computeDashboard, layoutRuns } from './dashboard-store.js';
import { WIDGET_META, kindOf, PERIOD_NAMES, EXPENSE_WIDGETS } from './dashboard-widgets.js';
import { getConfig, updateConfig } from './state.js';
import { emptyState, toast, deltaHtml } from './components.js';
import { escapeHtml, money, formatDateTime, formatDay } from './utilities.js';
import { barChartSvg, rankBarsHtml } from './charts.js';
import { getPendingUpdate, downloadUpdate } from './updates.js';

const LABELS = {
  day: { now: 'hoy', versus: 'vs. ayer', chart: 'Ventas por hora' },
  week: { now: 'esta semana', versus: 'vs. semana anterior', chart: 'Ventas por día de la semana' },
  month: { now: 'este mes', versus: 'vs. mes anterior', chart: 'Ventas por día del mes' }
};

let root = null;
let data = null;
let lowStock = 0;
let categoryColors = new Map();
let expenseColors = new Map();
let expensesOn = false;
let onResize = null;
let pendingUpdate = null;
let onUpdateAvailable = null;

export async function render(container) {
  root = container;
  const cfg = getConfig();
  expensesOn = true; // Gastos ya no es un módulo del menú: siempre se incluyen
  const [allSales, products, cats, expenses, expenseCats] = await Promise.all([
    sales.listSales(), catalog.listProducts(), catalog.listCategories(),
    expenseStore.listExpenses(), expenseStore.listExpenseCategories()
  ]);
  categoryColors = new Map(cats.map((c) => [c.id, c.color]));
  expenseColors = new Map(expenseCats.map((c) => [c.id, c.color]));
  data = computeDashboard(allSales, { timeZone: cfg.timezone, period: cfg.dashboard.period, expenses });
  destroy(); // limpia escuchadores anteriores antes de montar esta vista
  pendingUpdate = getPendingUpdate();
  onUpdateAvailable = (event) => { pendingUpdate = event.detail; drawScreen(); };
  window.addEventListener('metztli:update-available', onUpdateAvailable);
  data.productCount = products.length;
  draw();
  onResize = (() => { let t; return () => { clearTimeout(t); t = setTimeout(drawChart, 200); }; })();
  window.addEventListener('resize', onResize);
}

export function destroy() {
  if (onResize) window.removeEventListener('resize', onResize);
  if (onUpdateAvailable) window.removeEventListener('metztli:update-available', onUpdateAvailable);
  onResize = null;
  onUpdateAvailable = null;
}

/* ---------- Piezas ---------- */

const delta = deltaHtml;

const card = (label, value, sub) => `<div class="card kpi"><span class="muted small">${escapeHtml(label)}</span>
  <strong class="kpi-value">${value}</strong>${sub}</div>`;

// Cada bloque devuelve su HTML (o '' si no hay nada que mostrar).
function widgetHtml(id) {
  const p = data.period;
  const L = LABELS[p.key];
  const cfg = getConfig();
  if (EXPENSE_WIDGETS.includes(id) && !expensesOn) return '';
  const E = data.expenses;
  switch (id) {
    case 'shortcuts': return `<div class="dash-shortcuts">
        <a class="btn btn-primary" href="#/sales">Nueva venta</a>
        <a class="btn" href="#/sales" data-history>Historial</a>
        ${expensesOn ? '<a class="btn" href="#/expenses" data-newexpense>Gasto</a>' : ''}
        <a class="btn" href="#/catalog">Catálogo</a></div>`;
    case 'lowStock': return lowStock
      ? `<div class="notice warn">${lowStock} producto(s) con existencias bajas. <a class="btn btn-sm" href="#/catalog" data-lowstock>Verlos</a></div>` : '';
    case 'todaySales': return card('Ventas de hoy', money(data.today.total), `<span class="muted small">${data.today.count} operación(es)</span>${delta(data.today.total, data.today.prev.total, 'vs. ayer')}`);
    case 'monthSales': return card('Ventas del mes', money(data.month.total), `<span class="muted small">${data.month.count} operación(es)</span>${delta(data.month.total, data.month.prev.total, 'vs. mes anterior')}`);
    case 'periodSales': return card(`Ventas ${L.now}`, money(p.total), `<span class="muted small">${p.count} operación(es)</span>${delta(p.total, p.prev.total, L.versus)}`);
    case 'periodOps': return card(`Operaciones ${L.now}`, String(p.count), delta(p.count, p.prev.count, L.versus));
    case 'periodAvg': return card(`Ticket promedio ${L.now}`, money(p.avg), delta(p.avg, p.prev.avg, L.versus));
    case 'periodDiscounts': return card(`Descuentos ${L.now}`, money(p.discount), delta(p.discount, p.prev.discount, L.versus));
    case 'periodCancelled': return card(`Ventas canceladas ${L.now}`, String(p.cancelled), `<span class="muted small">No se suman a las ventas</span>${delta(p.cancelled, p.prev.cancelled, L.versus)}`);
    case 'periodUnits': return card(`Unidades vendidas ${L.now}`, String(p.units), delta(p.units, p.prev.units, L.versus));
    case 'periodExpenses': return card(`Gastos ${L.now}`, money(E.period.total), `<span class="muted small">${E.period.count} gasto(s)</span>${delta(E.period.total, E.period.prev.total, L.versus, true)}`);
    case 'periodResult': return card(`Ventas menos gastos ${L.now}`, `<span class="${data.result.value < 0 ? 'neg' : ''}">${money(data.result.value)}</span>`, `<span class="muted small">Ventas netas − gastos. No incluye el costo de los productos.</span>${delta(data.result.value, data.result.prev, L.versus)}`);
    case 'chart': return `<section class="card chart-card"><div class="row between"><h2>${L.chart}</h2>
        <span class="legend"><i class="lg-cur"></i> Actual <i class="lg-prev"></i> Anterior</span></div>
        <p class="muted small">Ventas netas (con descuentos aplicados). Descuentos ${L.now}: ${money(p.discount)} · Ventas canceladas ${L.now}: ${p.cancelled} (no se suman).</p>
        <div id="chart"></div></section>`;
    case 'topProducts': return `<section class="card stack"><h2>Más vendidos ${L.now}</h2>${data.top.length
      ? rankBarsHtml(data.top.map((t) => ({ label: t.name, value: t.amount, sub: `${t.qty} ${t.unit || ''} vendidos` })))
      : '<p class="muted">Sin ventas en este periodo.</p>'}</section>`;
    case 'categories': return `<section class="card stack"><h2>Ventas por categoría ${L.now}</h2>${data.byCategory.length
      ? rankBarsHtml(data.byCategory.map((c) => ({ label: c.name, value: c.amount, pct: c.pct, color: categoryColors.get(c.id) || '#64748b' })))
      : '<p class="muted">Sin ventas en este periodo.</p>'}</section>`;
    case 'expensesByCategory': return `<section class="card stack"><div class="row between"><h2>Gastos por categoría ${L.now}</h2>
        <a class="btn btn-sm" href="#/expenses" data-expenses-summary>Ver resumen</a></div>${E.byCategory.length
      ? rankBarsHtml(E.byCategory.map((c) => ({ label: c.name, value: c.amount, pct: c.pct, color: expenseColors.get(c.id) || '#64748b' })))
      : '<p class="muted">Sin gastos en este periodo.</p>'}</section>`;
    case 'recentExpenses': return `<section class="card stack"><div class="row between"><h2>Últimos gastos</h2>
        <a class="btn btn-sm" href="#/expenses">Ver gastos</a></div>${E.recent.length ? E.recent.map((x) => `<div class="row between recent"><span><strong>${escapeHtml(x.concept)}</strong>
          <span class="muted small"> · ${escapeHtml(x.categoryName || 'Sin categoría')} · ${escapeHtml(formatDay(x.date))}</span></span>
          <strong>${money(x.amount)}</strong></div>`).join('') : '<p class="muted">Aún no hay gastos registrados.</p>'}</section>`;
    case 'recent': return `<section class="card stack"><div class="row between"><h2>Últimas ventas</h2>
        <a class="btn btn-sm" href="#/sales" data-history>Ver historial</a></div>
        ${data.recent.map((s) => `<div class="row between recent"><span><strong>${escapeHtml(s.folio)}</strong>
          <span class="muted small"> · ${escapeHtml(formatDateTime(s.createdAt))}${s.customer ? ' · ' + escapeHtml(s.customer) : ''}</span></span>
          <strong>${money(s.total)}</strong></div>`).join('')}</section>`;
    default: return cfg ? '' : '';
  }
}

// Inicio muestra solo tres tarjetas del periodo elegido.
const INICIO_CARDS = ['periodSales', 'periodExpenses', 'periodResult'];
function layoutHtml() {
  return `<div class="kpis">${INICIO_CARDS.map(widgetHtml).filter(Boolean).join('')}</div>`;
}

function headerHtml(withPeriod) {
  const cfg = getConfig();
  return `<header class="page-head dash-head row between">
    <div><h1>Inicio</h1><p class="muted">${escapeHtml(cfg.business.name)}</p></div>
    <div class="row">
      ${withPeriod ? `<div class="seg" role="group" aria-label="Periodo">${Object.entries(PERIOD_NAMES).map(([k, l]) =>
        `<button type="button" data-period="${k}" aria-pressed="${k === data.period.key}">${l}</button>`).join('')}</div>` : ''}
    </div></header>`;
}

// Dibuja la pantalla y, si hay datos de PRUEBA cargados, muestra el aviso para no confundirlos con ventas reales.
function draw() {
  drawScreen();
  if (true) mountDemoBanner(root, () => render(root));
}

function updateNoticeHtml() {
  if (!pendingUpdate?.available) return '';
  return '<section class="update-notice" role="status" aria-live="polite">' +
    '<div class="update-notice-icon" aria-hidden="true">↑</div>' +
    '<div class="update-notice-copy">' +
      '<strong>¡Actualización disponible!</strong>' +
      '<span>METZTLI Caja v' + escapeHtml(pendingUpdate.version) + ' está lista para descargar.</span>' +
      '<small>Puedes seguir trabajando; este aviso permanecerá aquí hasta que actualices.</small>' +
    '</div>' +
    '<button class="btn btn-primary" type="button" id="dash-update-download">Descargar actualización</button>' +
  '</section>';
}

function drawScreen() {
  if (!data.hasSales && !(expensesOn && data.expenses.hasAny)) {
    const hasProducts = data.productCount > 0;
    root.innerHTML = updateNoticeHtml() + headerHtml(false) + emptyState({
      icon: 'chart', title: 'Aún no hay ventas',
      text: hasProducts
        ? 'Registra tu primera venta y aquí verás tus ventas del día y del mes, el ticket promedio, los productos más vendidos y más.'
        : 'Para empezar: 1) crea tus productos o servicios en el Catálogo, 2) registra tu primera venta. Los indicadores se calculan con tus ventas reales.',
      actionId: 'go-start', actionLabel: hasProducts ? 'Registrar primera venta' : 'Ir al Catálogo'
    });
    root.querySelector('#dash-update-download')?.addEventListener('click', () => downloadUpdate(pendingUpdate));
    root.querySelector('#dash-update-download')?.addEventListener('click', () => downloadUpdate(pendingUpdate));
    root.querySelector('#go-start').addEventListener('click', () => { location.hash = hasProducts ? '#/ventas' : '#/configuracion?s=catalog'; });
    return;
  }
  root.innerHTML = updateNoticeHtml() + headerHtml(true) + layoutHtml();
  root.querySelector('#dash-update-download')?.addEventListener('click', () => downloadUpdate(pendingUpdate));
  root.querySelector('.seg').addEventListener('click', async (e) => {
    const k = e.target.closest('[data-period]')?.dataset.period;
    if (!k || k === data.period.key) return;
    try { await updateConfig((c) => { c.dashboard.period = k; }); } catch (err) { toast('No se pudo guardar el periodo', 'error'); }
    await render(root);
  });
}

function drawChart() {
  const host = root?.querySelector('#chart');
  if (host && data) host.innerHTML = barChartSvg({ ...data.chart, type: getConfig().dashboard.chartType === 'line' ? 'line' : 'bars' }, host.clientWidth || 600);
}
