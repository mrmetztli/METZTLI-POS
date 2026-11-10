// expenses.js — pantalla "Gastos", con pestañas: Gastos (registro) · Resumen · Categorías.
// Las reglas están en expenses-store.js y los cálculos en expenses-calc.js; aquí solo se dibuja.
// Los gastos alimentan el Dashboard, los Reportes y los respaldos (ver README).
import { mountDemoBanner } from './demo-banner.js';
import * as store from './expenses-store.js';
import * as salesStore from './sales-store.js';
import { selectExpenses, totalOf, summarizeExpenses, detailTable, rangeFor, PRESETS, isActive } from './expenses-calc.js';
import { toCsv } from './reports-store.js';
import { getConfig } from './state.js';
import { toast, openModal, promptDialog, confirmDialog, openForm, emptyState, choicesHtml, bindChoices, deltaHtml, COLOR_CHOICES } from './components.js';
import { escapeHtml, money, formatDay, formatDateTime, download, uid } from './utilities.js';
import { barChartSvg, rankBarsHtml, donutHtml } from './charts.js';

const TABS = { list: 'Gastos', summary: 'Resumen', categories: 'Categorías' };
const STATUS = { active: 'Activos', cancelled: 'Cancelados', all: 'Todos' };
const EXPENSE_ICONS = ['🏠', '💡', '👥', '📦', '🚚', '🔧', '📣', '🧾', '🍽️', '🧹', '💳', '📌'];
const PAGE = 50;

// Los filtros y la pestaña abierta se conservan mientras la app esté abierta (no al recargar la página).
const ui = { tab: 'list', preset: 'month', q: '', categoryId: '', method: '', status: 'active', shown: PAGE, detailId: null, sumPreset: 'month', openNew: false };
let root = null;
let expenses = [];
let cats = [];
let onResize = null;
let summaryData = null;

// Lo usa el Dashboard: 'new' abre el formulario de un gasto nuevo y 'summary' abre la pestaña Resumen.
export function openExpensesNext(what) {
  if (what === 'summary') ui.tab = 'summary';
  else { ui.tab = 'list'; ui.detailId = null; ui.openNew = true; }
}

export async function render(container) {
  root = container;
  await load();
  draw();
  if (ui.openNew) { ui.openNew = false; openExpenseForm(); }
}

export function destroy() {
  if (onResize) window.removeEventListener('resize', onResize);
  onResize = null;
}

async function load() {
  [expenses, cats] = await Promise.all([store.listExpenses(), store.listExpenseCategories()]);
}

async function reload() { await load(); draw(); }

const catOf = (id) => cats.find((c) => c.id === id);
const todayKey = () => store.todayKey(getConfig());

// Ejecuta una acción; si falla, muestra el motivo en una ventana y deja todo como estaba.
async function run(action, okMessage) {
  try {
    await action();
    if (okMessage) toast(okMessage, 'ok');
  } catch (err) {
    await openModal({ title: 'No se pudo completar', message: err.message });
  }
  await reload();
}

function draw() {
  destroy();
  root.innerHTML = `
    <header class="page-head row between no-print">
      <div><h1>Gastos</h1><p class="muted">Registra lo que gastas y mira cuánto te queda de tus ventas</p></div>
      <div class="seg" role="group" aria-label="Sección">
        ${Object.entries(TABS).map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${ui.tab === k}">${l}</button>`).join('')}
      </div>
    </header><div id="tab"></div>`;
  root.querySelector('.seg').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]')?.dataset.tab;
    if (!tab || tab === ui.tab) return;
    ui.tab = tab;
    ui.detailId = null;
    draw();
  });
  const host = root.querySelector('#tab');
  if (ui.tab === 'summary') drawSummary(host);
  else if (ui.tab === 'categories') drawCategories(host);
  else if (ui.detailId) drawDetail(host);
  else drawList(host);
  mountDemoBanner(root, () => render(root));
}

/* ====================== Pestaña Gastos ====================== */

function filtered() {
  const { from, to } = rangeFor(ui.preset, todayKey());
  return selectExpenses(expenses, { from, to, categoryId: ui.categoryId, method: ui.method, status: ui.status, q: ui.q });
}

function drawList(host) {
  const methods = [...new Set([...store.methodsOf(getConfig()), ...expenses.map((e) => e.method).filter(Boolean)])];
  const opt = (v, l, cur) => `<option value="${escapeHtml(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${escapeHtml(l)}</option>`;
  const filterBrief = () => {
    const bits = [
      PRESETS[ui.preset] || ui.preset,
      ui.categoryId && (cats.find((c) => c.id === ui.categoryId)?.name || 'Categoría'),
      ui.method,
      ui.status !== 'active' && (STATUS[ui.status] || ui.status),
      ui.q.trim() && `“${ui.q.trim()}”`
    ].filter(Boolean);
    return bits.join(' · ');
  };

  host.innerHTML = `
    <div class="toolbar no-print">
      <button class="btn btn-primary" id="x-new" type="button">Nuevo gasto</button>
      <button class="btn" id="x-csv" type="button">Exportar CSV</button>
    </div>
    <details class="card filters no-print" id="x-filters">
      <summary class="filters-summary">
        <span class="filters-summary-main">
          <strong>Filtros</strong>
          <span class="filters-chevron" aria-hidden="true"></span>
        </span>
        <span class="filters-summary-hint muted small" id="x-filter-brief">${escapeHtml(filterBrief())}</span>
      </summary>
      <div class="filters-body form-grid">
        <div class="field"><label for="x-q">Buscar</label>
          <input class="input" id="x-q" type="search" placeholder="Concepto, proveedor, folio o notas" aria-label="Buscar gasto" value="${escapeHtml(ui.q)}"></div>
        <div class="field"><label for="x-preset">Periodo</label>
          <select class="input" id="x-preset">${Object.entries(PRESETS).map(([k, l]) => opt(k, l, ui.preset)).join('')}</select></div>
        <div class="field"><label for="x-cat">Categoría</label>
          <select class="input" id="x-cat">${opt('', 'Todas las categorías', ui.categoryId)}${cats.map((c) => opt(c.id, `${c.icon} ${c.name}${c.hidden ? ' (oculta)' : ''}`, ui.categoryId)).join('')}</select></div>
        <div class="field"><label for="x-method">Método de pago</label>
          <select class="input" id="x-method">${opt('', 'Todos los métodos', ui.method)}${methods.map((m) => opt(m, m, ui.method)).join('')}</select></div>
        <div class="field"><label for="x-status">Estado</label>
          <select class="input" id="x-status">${Object.entries(STATUS).map(([k, l]) => opt(k, l, ui.status)).join('')}</select></div>
      </div>
    </details>
    <div id="x-sum"></div>
    <div id="x-list" class="stack"></div>`;
  const $ = (s) => host.querySelector(s);
  const updateBrief = () => {
    const el = $('#x-filter-brief');
    if (el) el.textContent = filterBrief();
  };
  $('#x-new').addEventListener('click', () => openExpenseForm());
  $('#x-q').addEventListener('input', (e) => { ui.q = e.target.value; ui.shown = PAGE; updateBrief(); drawRows(host); });
  [['#x-preset', 'preset'], ['#x-cat', 'categoryId'], ['#x-method', 'method'], ['#x-status', 'status']].forEach(([sel, key]) =>
    $(sel).addEventListener('change', (e) => { ui[key] = e.target.value; ui.shown = PAGE; updateBrief(); drawRows(host); }));
  $('#x-csv').addEventListener('click', exportCsv);
  $('#x-list').addEventListener('click', (e) => {
    if (e.target.closest('#x-more')) { ui.shown += PAGE; drawRows(host); return; }
    const row = e.target.closest('[data-id]');
    if (row) { ui.detailId = row.dataset.id; draw(); window.scrollTo(0, 0); }
  });
  drawRows(host);
}

function drawRows(host) {
  const list = filtered();
  const t = totalOf(list);
  const cancelled = list.length - t.count;
  host.querySelector('#x-sum').innerHTML = expenses.length
    ? `<div class="card exp-total row between"><span><span class="muted small">Total de gastos activos en la lista</span><br><strong class="kpi-value">${money(t.total)}</strong></span>
        <span class="muted small">${t.count} gasto(s)${cancelled ? ` · ${cancelled} cancelado(s) (no suman)` : ''}</span></div>` : '';
  const box = host.querySelector('#x-list');
  if (!expenses.length) {
    box.innerHTML = emptyState({
      icon: 'wallet', title: 'Aún no hay gastos registrados',
      text: 'Anota la renta, la luz, los insumos o los sueldos. Se restan de tus ventas en el Dashboard y en los Reportes.',
      actionId: 'x-first', actionLabel: 'Registrar mi primer gasto'
    });
    box.querySelector('#x-first').addEventListener('click', () => openExpenseForm());
    return;
  }
  if (!list.length) { box.innerHTML = '<div class="card empty"><h2>Sin resultados</h2><p>Ningún gasto coincide con estos filtros. Prueba con otro periodo o quita algún filtro.</p></div>'; return; }
  box.innerHTML = list.slice(0, ui.shown).map((e) => {
    const c = catOf(e.categoryId);
    return `<button type="button" class="card hrow" data-id="${escapeHtml(e.id)}">
      <span class="exp-main"><span class="cat-dot sm" style="background:${escapeHtml(c?.color || '#64748b')}">${escapeHtml(c?.icon || e.categoryIcon || '📌')}</span>
        <span><strong>${escapeHtml(e.concept)}</strong> ${isActive(e) ? '' : '<span class="badge warn">Cancelado</span>'}<br>
          <span class="muted small">${escapeHtml(e.categoryName || 'Sin categoría')} · ${escapeHtml(formatDay(e.date))} · ${escapeHtml(e.method || '')}${e.supplier ? ' · ' + escapeHtml(e.supplier) : ''} · ${escapeHtml(e.folio)}</span></span></span>
      <strong class="${isActive(e) ? '' : 'strike'}">${money(e.amount)}</strong></button>`;
  }).join('') + (list.length > ui.shown ? '<button type="button" class="btn" id="x-more">Ver más</button>' : '');
}

function exportCsv() {
  const list = filtered();
  if (!list.length) { toast('No hay gastos para exportar con estos filtros', 'error'); return; }
  const { from, to } = rangeFor(ui.preset, todayKey());
  download(`gastos_${from || 'inicio'}_${to || 'hoy'}.csv`, '﻿' + toCsv(detailTable(list), { datetime: formatDateTime }), 'text/csv');
  toast('CSV exportado', 'ok');
}

function drawDetail(host) {
  const e = expenses.find((x) => x.id === ui.detailId);
  if (!e) { ui.detailId = null; drawList(host); return; }
  const c = catOf(e.categoryId);
  const cfg = getConfig();
  const rows = [
    ['Folio', e.folio], ['Fecha', formatDay(e.date)], ['Categoría', `${c?.icon || e.categoryIcon || ''} ${e.categoryName || 'Sin categoría'}`],
    ['Método de pago', e.method || '—'], ['Proveedor', e.supplier || '—'], ['Notas', e.notes || '—'], ['Registrado', formatDateTime(e.createdAt)]
  ];
  host.innerHTML = `
    <div class="row no-print" style="margin-bottom:16px"><button type="button" class="btn" id="d-back">← Volver a gastos</button></div>
    ${isActive(e) ? '' : `<div class="notice warn" style="margin-bottom:16px"><strong>Gasto cancelado</strong> el ${escapeHtml(formatDateTime(e.cancelled.at))}. No suma en ningún reporte.<br>Motivo: ${escapeHtml(e.cancelled.reason)}</div>`}
    <div class="card stack">
      <div class="row between"><h2>${escapeHtml(e.concept)}</h2><strong class="kpi-value ${isActive(e) ? '' : 'strike'}">${money(e.amount)}</strong></div>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd style="text-align:right">${escapeHtml(v)}</dd>`).join('')}</dl>
      ${isActive(e) ? `<div class="row"><button type="button" class="btn btn-primary" id="d-edit">Editar</button>
        ${cfg.expenses.cancelEnabled ? '<button type="button" class="btn btn-danger" id="d-cancel">Cancelar gasto</button>' : ''}</div>` : ''}
    </div>`;
  host.querySelector('#d-back').addEventListener('click', () => { ui.detailId = null; draw(); window.scrollTo(0, 0); });
  host.querySelector('#d-edit')?.addEventListener('click', () => openExpenseForm(e));
  host.querySelector('#d-cancel')?.addEventListener('click', async () => {
    const reason = await promptDialog({
      title: `Cancelar gasto ${e.folio}`, message: 'El gasto dejará de sumar en el Dashboard y en los Reportes. Queda registrado con su motivo y no se puede deshacer.',
      label: 'Motivo de la cancelación', confirmText: 'Cancelar gasto', danger: true,
      validate: (v) => (v.trim().length >= 3 ? '' : 'Escribe el motivo (mínimo 3 caracteres).')
    });
    if (reason === null) return;
    const rules = getConfig().expenses;
    await run(() => store.cancelExpense(e.id, reason, { enabled: rules.cancelEnabled, maxDays: rules.cancelDays }), 'Gasto cancelado');
  });
}

// Alta y edición en una ventana. El id del gasto nuevo se reserva al abrirla, así pulsar dos veces "Guardar" no lo duplica.
async function openExpenseForm(existing = null) {
  const cfg = getConfig();
  const visible = cats.filter((c) => !c.hidden || c.id === existing?.categoryId);
  if (!visible.length) {
    await openModal({ title: 'Primero crea una categoría', message: 'Para registrar un gasto necesitas al menos una categoría visible. Créala en la pestaña Categorías.' });
    ui.tab = 'categories';
    draw();
    return;
  }
  const methods = [...new Set([...store.methodsOf(cfg), ...(existing?.method ? [existing.method] : [])])];
  const method = existing?.method || (methods.includes(cfg.expenses.defaultMethod) ? cfg.expenses.defaultMethod : 'Efectivo');
  const draftId = uid();
  const opt = (v, l, cur) => `<option value="${escapeHtml(v)}" ${v === cur ? 'selected' : ''}>${escapeHtml(l)}</option>`;
  const saved = await openForm({
    title: existing ? `Editar gasto ${existing.folio}` : 'Nuevo gasto', submitText: existing ? 'Guardar cambios' : 'Guardar gasto', wide: true,
    html: `
      <div class="form-grid">
        <div class="field"><label for="f-concept">Concepto</label><input id="f-concept" class="input" maxlength="80" value="${escapeHtml(existing?.concept || '')}" placeholder="Ej. Renta de noviembre" required></div>
        <div class="field"><label for="f-amount">Monto</label><input id="f-amount" class="input" type="number" inputmode="decimal" min="0.01" step="0.01" value="${existing ? existing.amount : ''}" placeholder="0.00" required></div>
        <div class="field"><label for="f-date">Fecha</label><input id="f-date" class="input" type="date" value="${existing?.date || todayKey()}" ${cfg.expenses.allowFutureDates ? '' : `max="${todayKey()}"`} required></div>
        <div class="field"><label for="f-cat">Categoría</label><select id="f-cat" class="input">${visible.map((c) => opt(c.id, `${c.icon} ${c.name}`, existing?.categoryId)).join('')}</select></div>
        <div class="field"><label for="f-method">Método de pago</label><select id="f-method" class="input">${methods.map((m) => opt(m, m, method)).join('')}</select></div>
        <div class="field"><label for="f-supplier">Proveedor (opcional)</label><input id="f-supplier" class="input" maxlength="60" value="${escapeHtml(existing?.supplier || '')}"></div>
      </div>
      <div class="field"><label for="f-notes">Notas (opcional)</label><textarea id="f-notes" class="input" rows="2" maxlength="300" style="padding:10px 12px">${escapeHtml(existing?.notes || '')}</textarea></div>`,
    onSubmit: async (form) => {
      const v = (id) => form.querySelector(id).value;
      const input = { id: existing ? undefined : draftId, date: v('#f-date'), concept: v('#f-concept'), amount: v('#f-amount'), categoryId: v('#f-cat'), method: v('#f-method'), supplier: v('#f-supplier'), notes: v('#f-notes') };
      if (existing) await store.updateExpense(existing.id, input, getConfig());
      else await store.createExpense(input, getConfig());
    }
  });
  if (saved) { toast(existing ? 'Cambios guardados' : 'Gasto registrado', 'ok'); await reload(); }
}

/* ====================== Pestaña Resumen ====================== */

async function drawSummary(host) {
  const presets = Object.entries(PRESETS).filter(([k]) => k !== 'all');
  const range = rangeFor(ui.sumPreset, todayKey());
  host.innerHTML = `
    <div class="toolbar no-print"><select class="input" id="s-preset" aria-label="Periodo" style="width:auto">${presets.map(([k, l]) => `<option value="${k}" ${k === ui.sumPreset ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn" id="s-print" type="button">Imprimir / PDF</button></div>
    <div id="s-body"><p class="muted">Calculando…</p></div>`;
  host.querySelector('#s-preset').addEventListener('change', (e) => { ui.sumPreset = e.target.value; draw(); });
  host.querySelector('#s-print').addEventListener('click', () => window.print());
  let sales = [];
  try { sales = await salesStore.listSales(); } catch (err) { toast('No se pudieron leer las ventas: ' + err.message, 'error'); }
  if (!host.isConnected) return; // el usuario cambió de pestaña mientras se calculaba
  const s = summarizeExpenses(expenses, sales, { ...range, timeZone: getConfig().timezone });
  summaryData = s;
  const body = host.querySelector('#s-body');
  const versus = 'vs. periodo anterior';
  const kpi = (label, value, sub) => `<div class="card kpi"><span class="muted small">${label}</span><strong class="kpi-value">${value}</strong>${sub}</div>`;
  const colorOf = (id) => catOf(id)?.color || '#64748b';

  if (!s.expenses.count && !expenses.some((e) => isActive(e))) {
    body.innerHTML = emptyState({ icon: 'wallet', title: 'Aún no hay gastos que resumir', text: 'Cuando registres gastos verás aquí cuánto gastas, en qué y cuánto te queda de tus ventas.', actionId: 's-go', actionLabel: 'Registrar un gasto' });
    body.querySelector('#s-go').addEventListener('click', () => { ui.tab = 'list'; ui.openNew = true; render(root); });
    return;
  }
  body.innerHTML = `
    <p class="muted small" style="margin-bottom:12px">Del ${escapeHtml(formatDay(s.from))} al ${escapeHtml(formatDay(s.to))} · se compara con del ${escapeHtml(formatDay(s.prevFrom))} al ${escapeHtml(formatDay(s.prevTo))}. Los gastos cancelados no suman.</p>
    <div class="kpis">
      ${kpi('Gastos', money(s.expenses.total), `<span class="muted small">${s.expenses.count} gasto(s) · promedio ${money(s.expenses.avg)}</span>${deltaHtml(s.expenses.total, s.expenses.prevTotal, versus, true)}`)}
      ${kpi('Ventas netas', money(s.sales.net), `<span class="muted small">${s.sales.ops} operación(es)</span>${deltaHtml(s.sales.net, s.sales.prevNet, versus)}`)}
      ${kpi('Ventas menos gastos', `<span class="${s.result.value < 0 ? 'neg' : ''}">${money(s.result.value)}</span>`, `<span class="muted small">No incluye el costo de los productos</span>${deltaHtml(s.result.value, s.result.prev, versus)}`)}
      ${kpi('Efectivo neto', `<span class="${s.cash.net < 0 ? 'neg' : ''}">${money(s.cash.net)}</span>`, `<span class="muted small">Cobrado en efectivo ${money(s.cash.in)} − gastos en efectivo ${money(s.cash.out)}</span>`)}
    </div>
    ${s.expenses.count ? `
    <section class="card chart-card" style="margin-top:16px"><h2>Gastos por ${s.series.group === 'day' ? 'día' : s.series.group === 'week' ? 'semana' : 'mes'}</h2><div id="s-chart"></div></section>
    <div class="dash-2" style="margin-top:16px">
      <section class="card stack"><h2>Por categoría</h2>${donutHtml(s.byCategory.map((c) => ({ label: c.label, value: c.amount, pct: c.pct, color: colorOf(c.key) })))}</section>
      <section class="card stack"><h2>Por método de pago</h2>${rankBarsHtml(s.byMethod.map((m) => ({ label: m.label, value: m.amount, pct: m.pct, sub: `${m.count} gasto(s)` })))}</section>
    </div>
    <section class="card stack" style="margin-top:16px"><h2>Mayores gastos del periodo</h2>
      ${s.top.map((e) => `<div class="row between recent"><span><strong>${escapeHtml(e.concept)}</strong>
        <span class="muted small"> · ${escapeHtml(e.categoryName || 'Sin categoría')} · ${escapeHtml(formatDay(e.date))}</span></span><strong>${money(e.amount)}</strong></div>`).join('')}</section>`
    : '<div class="card empty" style="margin-top:16px"><h2>Sin gastos en este periodo</h2><p>Prueba con otro periodo para ver el detalle.</p></div>'}`;
  drawSummaryChart(body);
  onResize = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => drawSummaryChart(root), 200); }; })();
  window.addEventListener('resize', onResize);
}

function drawSummaryChart(scope) {
  const host = scope?.querySelector('#s-chart');
  const s = summaryData;
  if (!host || !s) return;
  host.innerHTML = barChartSvg({ type: 'bars', labels: s.series.labels, full: s.series.full, current: s.series.values, show: s.series.show }, host.clientWidth || 600);
}

/* ====================== Pestaña Categorías ====================== */

function drawCategories(host) {
  const month = rangeFor('month', todayKey());
  const monthTotals = new Map();
  for (const e of selectExpenses(expenses, { ...month, status: 'active' })) monthTotals.set(e.categoryId, (monthTotals.get(e.categoryId) || 0) + Math.round(e.amount * 100));
  const countOf = (id) => expenses.filter((e) => e.categoryId === id).length;
  host.innerHTML = `
    <div class="row no-print" style="margin-bottom:16px"><button class="btn btn-primary" id="c-new" type="button">Nueva categoría</button></div>
    <div class="stack">${cats.length ? cats.map((c, i) => `
      <div class="card crow" data-id="${escapeHtml(c.id)}">
        <div class="crow-main"><span class="cat-dot" style="background:${escapeHtml(c.color)}">${escapeHtml(c.icon)}</span>
          <div><strong>${escapeHtml(c.name)}</strong> ${c.hidden ? '<span class="badge">Oculta</span>' : ''}
            <div class="muted small">${countOf(c.id)} gasto(s) · este mes ${money((monthTotals.get(c.id) || 0) / 100)}${c.description ? ' · ' + escapeHtml(c.description) : ''}</div></div></div>
        <div class="row">
          <button class="btn btn-sm" data-act="up" aria-label="Subir ${escapeHtml(c.name)}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm" data-act="down" aria-label="Bajar ${escapeHtml(c.name)}" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm" data-act="edit">Editar</button>
          <button class="btn btn-sm" data-act="hide">${c.hidden ? 'Mostrar' : 'Ocultar'}</button>
          <button class="btn btn-sm" data-act="delete">Eliminar</button>
        </div></div>`).join('') : `<div class="card empty"><h2>Aún no tienes categorías de gasto</h2><p>Crea categorías como “Renta” o “Insumos” para saber en qué se va tu dinero.</p></div>`}</div>
    <p class="muted small" style="margin-top:12px">Ocultar una categoría la quita del formulario de nuevos gastos pero conserva el historial. Solo se pueden eliminar las que no tienen gastos.</p>`;
  host.querySelector('#c-new').addEventListener('click', () => openCategoryForm());
  host.querySelector('.stack').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = e.target.closest('[data-id]')?.dataset.id;
    const c = catOf(id);
    if (!act || !c) return;
    if (act === 'up') await run(() => store.moveExpenseCategory(id, -1));
    if (act === 'down') await run(() => store.moveExpenseCategory(id, 1));
    if (act === 'hide') await run(() => store.setExpenseCategoryHidden(id, !c.hidden), c.hidden ? 'Categoría visible' : 'Categoría oculta');
    if (act === 'edit') openCategoryForm(c);
    if (act === 'delete') {
      const yes = await confirmDialog({ title: `¿Eliminar “${c.name}”?`, message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true });
      if (yes) await run(() => store.deleteExpenseCategory(id), 'Categoría eliminada');
    }
  });
}

async function openCategoryForm(existing = null) {
  const c = existing || { name: '', description: '', color: COLOR_CHOICES[0], icon: EXPENSE_ICONS[0] };
  const saved = await openForm({
    title: existing ? 'Editar categoría de gasto' : 'Nueva categoría de gasto', submitText: 'Guardar categoría',
    html: `
      <div class="field"><label for="c-name">Nombre</label><input id="c-name" class="input" maxlength="40" value="${escapeHtml(c.name)}" required></div>
      <div class="field"><label for="c-desc">Descripción (opcional)</label><input id="c-desc" class="input" maxlength="120" value="${escapeHtml(c.description)}"></div>
      <div class="field"><span class="label">Icono</span>${choicesHtml('c-icon', EXPENSE_ICONS, c.icon, 'emoji', 'Icono')}</div>
      <div class="field"><span class="label">Color</span>${choicesHtml('c-color', COLOR_CHOICES, c.color, 'swatch', 'Color')}</div>`,
    onReady: (form) => { bindChoices(form, 'c-icon'); bindChoices(form, 'c-color'); },
    onSubmit: async (form) => {
      await store.saveExpenseCategory({
        id: existing?.id, name: form.querySelector('#c-name').value, description: form.querySelector('#c-desc').value,
        icon: form.querySelector('#c-icon').value, color: form.querySelector('#c-color').value
      });
    }
  });
  if (saved) { toast('Categoría guardada', 'ok'); await reload(); }
}
