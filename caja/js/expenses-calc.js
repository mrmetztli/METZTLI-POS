// expenses-calc.js — cálculos de gastos SIN pantalla y SIN base de datos (funciones puras).
// Los usan la pestaña Gastos, el Dashboard (vía dashboard-store) y los Reportes.
//
// Reglas:
//  · Un gasto tiene una fecha contable "AAAA-MM-DD" (date) ya en la zona horaria del negocio; no se vuelve a convertir.
//  · Solo cuentan los gastos activos. Los cancelados se muestran aparte y nunca suman.
//  · Todo el dinero se suma en centavos enteros.
import { dateKey, addDays, weekStart, monthStart, prevMonthStart, lastDayOfMonth } from './dashboard-store.js';

const cents = (n) => Math.round(Number(n) * 100);
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const isActive = (e) => e.status !== 'cancelled';
export const diffDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export const PRESETS = {
  today: 'Hoy', week: 'Esta semana', month: 'Este mes', lastmonth: 'Mes pasado',
  last30: 'Últimos 30 días', year: 'Este año', all: 'Todo'
};

// Rango { from, to } de un periodo rápido. "all" no limita las fechas (from y to vacíos).
export function rangeFor(preset, todayKey) {
  switch (preset) {
    case 'today': return { from: todayKey, to: todayKey };
    case 'week': return { from: weekStart(todayKey), to: todayKey };
    case 'lastmonth': { const pm = prevMonthStart(todayKey); return { from: pm, to: addDays(pm, lastDayOfMonth(pm) - 1) }; }
    case 'last30': return { from: addDays(todayKey, -29), to: todayKey };
    case 'year': return { from: `${todayKey.slice(0, 4)}-01-01`, to: todayKey };
    case 'all': return { from: '', to: '' };
    default: return { from: monthStart(todayKey), to: todayKey };
  }
}

// f: { from, to, categoryId, method, status: 'all' | 'active' | 'cancelled', q }
export function selectExpenses(list, f = {}) {
  const q = String(f.q || '').trim().toLowerCase();
  return list.filter((e) => {
    if (f.status && f.status !== 'all' && (f.status === 'active') !== isActive(e)) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    if (f.categoryId && e.categoryId !== f.categoryId) return false;
    if (f.method && e.method !== f.method) return false;
    if (q && ![e.folio, e.concept, e.supplier, e.categoryName, e.notes].some((v) => String(v || '').toLowerCase().includes(q))) return false;
    return true;
  });
}

// Suma de los gastos ACTIVOS de la lista.
export function totalOf(list) {
  let c = 0; let n = 0;
  for (const e of list) if (isActive(e)) { c += cents(e.amount); n += 1; }
  return { total: c / 100, count: n, cents: c };
}

// Agrupa gastos activos: [{ key, label, amount, count, pct }] de mayor a menor.
export function groupExpenses(list, keyOf, labelOf) {
  const groups = new Map();
  let all = 0;
  for (const e of list) {
    if (!isActive(e)) continue;
    const k = keyOf(e);
    const g = groups.get(k) || { key: k, label: labelOf(e), cents: 0, count: 0 };
    g.cents += cents(e.amount); g.count += 1; g.label = labelOf(e);
    groups.set(k, g);
    all += cents(e.amount);
  }
  return [...groups.values()].sort((a, b) => b.cents - a.cents)
    .map((g) => ({ key: g.key, label: g.label, amount: g.cents / 100, count: g.count, pct: all ? (g.cents / all) * 100 : 0 }));
}

// Lo cobrado en efectivo en una venta (el cambio ya está descontado).
export function cashCollectedCents(sale) {
  const cash = (sale.payments || []).filter((p) => p.cash).reduce((s, p) => s + cents(p.amount), 0);
  return Math.max(0, cash - cents(sale.change || 0));
}

// Serie para la gráfica: por día (≤ 45 días), por semana (≤ 190) o por mes.
function buildSeries(list, from, to) {
  const len = diffDays(from, to) + 1;
  const group = len <= 45 ? 'day' : len <= 190 ? 'week' : 'month';
  const keyOf = (d) => (group === 'day' ? d : group === 'week' ? weekStart(d) : d.slice(0, 7));
  const keys = [];
  if (group === 'month') {
    let m = from.slice(0, 7);
    const end = to.slice(0, 7);
    while (m <= end) {
      keys.push(m);
      const y = Number(m.slice(0, 4)); const mo = Number(m.slice(5, 7));
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    }
  } else {
    let k = group === 'week' ? weekStart(from) : from;
    while (k <= to) { keys.push(k); k = addDays(k, group === 'week' ? 7 : 1); }
  }
  const sums = new Map(keys.map((k) => [k, 0]));
  for (const e of list) if (isActive(e)) sums.set(keyOf(e.date), (sums.get(keyOf(e.date)) || 0) + cents(e.amount));
  const dm = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  const step = Math.max(1, Math.ceil(keys.length / 8));
  return {
    group,
    labels: keys.map((k) => (group === 'month' ? MONTHS[Number(k.slice(5, 7)) - 1] : dm(k))),
    full: keys.map((k) => (group === 'month' ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : group === 'week' ? `Semana del ${dm(k)}` : `${dm(k)}/${k.slice(0, 4)}`)),
    values: keys.map((k) => sums.get(k) / 100),
    show: keys.map((_, i) => i % step === 0)
  };
}

// Resumen de un periodo cerrado [from, to] (ambos obligatorios) frente al periodo anterior de la misma duración.
// Cruza gastos con ventas: resultado = ventas netas − gastos y efectivo neto = cobrado en efectivo − gastos en efectivo.
export function summarizeExpenses(expenses, sales, { from, to, timeZone = 'America/Mexico_City' }) {
  const len = diffDays(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -len);
  const cur = selectExpenses(expenses, { from, to });
  const prev = selectExpenses(expenses, { from: prevFrom, to: prevTo });
  const t = totalOf(cur);
  const p = totalOf(prev);

  let salesC = 0; let prevSalesC = 0; let cashInC = 0; let ops = 0;
  for (const s of sales) {
    if (s.status === 'cancelled') continue;
    const k = dateKey(s.createdAt, timeZone);
    if (k >= from && k <= to) { salesC += cents(s.total); cashInC += cashCollectedCents(s); ops += 1; }
    else if (k >= prevFrom && k <= prevTo) prevSalesC += cents(s.total);
  }
  const cashOutC = cur.filter((e) => isActive(e) && e.method === 'Efectivo').reduce((a, e) => a + cents(e.amount), 0);
  const active = cur.filter(isActive);

  return {
    from, to, days: len, prevFrom, prevTo,
    expenses: { total: t.total, count: t.count, avg: t.count ? Math.round(t.cents / t.count) / 100 : 0, prevTotal: p.total, cancelled: cur.length - t.count },
    sales: { net: salesC / 100, ops, prevNet: prevSalesC / 100 },
    result: { value: (salesC - t.cents) / 100, prev: (prevSalesC - p.cents) / 100 },
    cash: { in: cashInC / 100, out: cashOutC / 100, net: (cashInC - cashOutC) / 100 },
    byCategory: groupExpenses(cur, (e) => e.categoryId, (e) => e.categoryName || 'Sin categoría'),
    byMethod: groupExpenses(cur, (e) => e.method, (e) => e.method || 'Sin método'),
    top: [...active].sort((a, b) => cents(b.amount) - cents(a.amount) || (a.date < b.date ? 1 : -1)).slice(0, 5),
    series: buildSeries(cur, from, to)
  };
}

// Tabla (misma forma que los reportes) con el detalle de gastos; también sirve para exportar CSV.
export function detailTable(list) {
  const rows = list.map((e) => ({
    folio: e.folio, date: e.date, concept: e.concept, category: e.categoryName || 'Sin categoría', supplier: e.supplier || '',
    method: e.method || '', amount: e.amount, status: isActive(e) ? 'Activo' : 'Cancelado', reason: e.cancelled?.reason || '', notes: e.notes || ''
  }));
  return {
    columns: [
      { id: 'folio', label: 'Folio', type: 'text' }, { id: 'date', label: 'Fecha', type: 'date' }, { id: 'concept', label: 'Concepto', type: 'text' },
      { id: 'category', label: 'Categoría', type: 'text' }, { id: 'supplier', label: 'Proveedor', type: 'text' }, { id: 'method', label: 'Método de pago', type: 'text' },
      { id: 'amount', label: 'Monto', type: 'money' }, { id: 'status', label: 'Estado', type: 'text' }, { id: 'reason', label: 'Motivo de cancelación', type: 'text' }, { id: 'notes', label: 'Notas', type: 'text' }
    ],
    rows,
    totals: { folio: 'Total gastos activos', amount: totalOf(list).total }
  };
}
