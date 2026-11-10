// reports-store.js — cálculo de reportes y exportación a CSV (sin pantalla).
//
// Modelo: cada artículo vendido es un "hecho" con su importe BRUTO (antes de descuentos) y NETO
// (después de repartir el descuento de la venta entre sus artículos, sin perder ni un centavo).
//   · Ventas brutas = suma de importes antes de descuentos (solo completadas)
//   · Descuentos    = brutas − netas
//   · Ventas netas  = lo que realmente se cobró por esos artículos (solo completadas)
//   · Canceladas    = se muestran aparte; NUNCA se suman ni se restan de las netas
// Todo se calcula en centavos enteros. La utilidad solo se calcula con costos conocidos.
import { dateKey, addDays, weekStart } from './dashboard-store.js';
import { selectExpenses, totalOf, groupExpenses, isActive, detailTable } from './expenses-calc.js';

export const REPORT_VIEWS = {
  summary: 'Resumen', period: 'Por periodo', product: 'Por producto',
  category: 'Por categoría', method: 'Por método de pago', detail: 'Detalle de ventas',
  expenseCategory: 'Gastos por categoría', expenseDetail: 'Detalle de gastos'
};
// Los reportes de gastos usan el filtro de periodo, método de pago, estado y categoría de gasto (no producto ni categoría de producto).
export const isExpenseView = (v) => v === 'expenseCategory' || v === 'expenseDetail';
export const GROUPS = { day: 'Día', week: 'Semana', month: 'Mes' };

const cents = (n) => Math.round(Number(n) * 100);
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const dmy = (key) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
const dm = (key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

// Reparte el descuento de una venta entre sus artículos (método del mayor residuo): la suma es exacta.
export function allocate(sale) {
  const gross = sale.items.map((i) => cents(i.total));
  const subtotal = gross.reduce((a, b) => a + b, 0);
  const discount = Math.min(cents(sale.discount?.amount || 0), subtotal);
  if (subtotal <= 0 || discount <= 0) return gross.map((g) => ({ gross: g, net: g }));
  const exact = gross.map((g) => (g * discount) / subtotal);
  const part = exact.map(Math.floor);
  let rest = discount - part.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - part[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < rest; k++) part[order[k][1]] += 1;
  return gross.map((g, i) => ({ gross: g, net: g - part[i] }));
}

// Cuánto de la venta se cobró con cada método (el cambio se descuenta del efectivo), en centavos.
function methodShares(sale) {
  const shares = new Map();
  let change = cents(sale.change || 0);
  for (const p of sale.payments || []) {
    let c = cents(p.amount);
    if (p.cash && change > 0) { const take = Math.min(change, c); c -= take; change -= take; }
    shares.set(p.method, (shares.get(p.method) || 0) + c);
  }
  if (!shares.size) shares.set('Sin cobro', 0);
  return shares;
}

// filters: { from, to, productId, categoryId ('' todas | 'none' sin categoría | id), method, status ('all'|'completed'|'cancelled') }
function select(sales, f, tz) {
  const facts = [];
  const infos = new Map();
  for (const s of sales) {
    if (f.status && f.status !== 'all' && s.status !== f.status) continue;
    const day = dateKey(s.createdAt, tz);
    if (f.from && day < f.from) continue;
    if (f.to && day > f.to) continue;
    if (f.method && !(s.payments || []).some((p) => p.method === f.method)) continue;
    const alloc = allocate(s);
    const mine = [];
    s.items.forEach((i, idx) => {
      if (f.productId && i.productId !== f.productId) return;
      if (f.categoryId) {
        const c = i.categoryId || '';
        if (f.categoryId === 'none' ? c !== '' : c !== f.categoryId) return;
      }
      mine.push({
        saleId: s.id, folio: s.folio, createdAt: s.createdAt, day, status: s.status,
        productId: i.productId, name: i.name, unit: i.unit,
        categoryId: i.categoryId || '', categoryName: i.categoryName || '',
        qty: i.qty, gross: alloc[idx].gross, net: alloc[idx].net,
        cost: i.cost === null || i.cost === undefined ? null : Math.round(i.cost * i.qty * 100)
      });
    });
    if (mine.length) {
      facts.push(...mine);
      infos.set(s.id, { sale: s, day, facts: mine, net: mine.reduce((a, x) => a + x.net, 0) });
    }
  }
  return { facts, infos };
}

const newAcc = () => ({ ops: new Set(), cancelledOps: new Set(), qty: 0, gross: 0, net: 0, discount: 0, cancelledAmount: 0, costNet: 0, cost: 0 });
function add(a, f) {
  if (f.status === 'cancelled') { a.cancelledOps.add(f.saleId); a.cancelledAmount += f.net; return; }
  a.ops.add(f.saleId);
  a.qty += f.qty; a.gross += f.gross; a.net += f.net; a.discount += f.gross - f.net;
  if (f.cost !== null) { a.costNet += f.net; a.cost += f.cost; }
}
function finish(a) {
  const ops = a.ops.size;
  const r = {
    ops, qty: Math.round(a.qty * 1000) / 1000, gross: a.gross / 100, discount: a.discount / 100, net: a.net / 100,
    avg: ops ? Math.round(a.net / ops) / 100 : 0,
    cancelledOps: a.cancelledOps.size, cancelledAmount: a.cancelledAmount / 100,
    cost: null, utility: null, utilityComplete: false, costCoverage: null
  };
  if (a.net > 0) {
    r.costCoverage = a.costNet / a.net;
    if (a.costNet > 0) { r.cost = a.cost / 100; r.utility = (a.costNet - a.cost) / 100; r.utilityComplete = a.costNet === a.net; }
  }
  return r;
}
const accOf = (facts) => { const a = newAcc(); facts.forEach((f) => add(a, f)); return a; };

function groupFacts(facts, keyOf) {
  const groups = new Map();
  for (const f of facts) {
    const k = keyOf(f);
    if (!groups.has(k)) groups.set(k, { acc: newAcc(), latest: f });
    const g = groups.get(k);
    add(g.acc, f);
    if (f.createdAt > g.latest.createdAt) g.latest = f;
  }
  return groups;
}

const money = (id, label) => ({ id, label, type: 'money' });
const ints = (id, label) => ({ id, label, type: 'int' });

function periodKey(day, group) {
  return group === 'week' ? weekStart(day) : group === 'month' ? day.slice(0, 7) : day;
}
function periodLabel(key, group) {
  if (group === 'week') return `Semana del ${dmy(key)}`;
  if (group === 'month') return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
  return dmy(key);
}

function withUtility(row, r) { return { ...row, utility: r.utilityComplete ? r.utility : null }; }

// Reportes de gastos: list = gastos ya filtrados (activos y cancelados según el filtro de estado).
function buildExpenseTable(view, list) {
  if (view === 'expenseDetail') {
    const t = detailTable(list);
    return { ...t, chart: null };
  }
  const cancelled = new Map();
  for (const e of list) if (!isActive(e)) cancelled.set(e.categoryId, (cancelled.get(e.categoryId) || 0) + cents(e.amount));
  const total = totalOf(list);
  const rows = groupExpenses(list, (e) => e.categoryId, (e) => e.categoryName || 'Sin categoría')
    .map((g) => ({ key: g.key, label: g.label, ops: g.count, amount: g.amount, pct: g.pct, cancelledAmount: (cancelled.get(g.key) || 0) / 100 }));
  for (const e of list) {
    if (isActive(e) || rows.some((r) => r.key === e.categoryId)) continue;
    rows.push({ key: e.categoryId, label: e.categoryName || 'Sin categoría', ops: 0, amount: 0, pct: 0, cancelledAmount: (cancelled.get(e.categoryId) || 0) / 100 });
  }
  return {
    columns: [{ id: 'label', label: 'Categoría de gasto', type: 'text' }, ints('ops', 'Gastos'), money('amount', 'Monto'), { id: 'pct', label: '% del total', type: 'pct' }, money('cancelledAmount', 'Monto cancelado')],
    rows, totals: { label: 'Total', ops: total.count, amount: total.total, pct: total.total > 0 ? 100 : 0, cancelledAmount: [...cancelled.values()].reduce((a, b) => a + b, 0) / 100 },
    chart: { type: 'rank', items: rows.filter((r) => r.amount > 0).slice(0, 10).map((r) => ({ label: r.label, value: r.amount, pct: r.pct })) }
  };
}

function buildTable(view, group, sel) {
  if (isExpenseView(view)) return buildExpenseTable(view, []);
  const total = finish(accOf(sel.facts));
  const share = (net) => (total.net > 0 ? (net / total.net) * 100 : 0);

  if (view === 'period') {
    const groups = groupFacts(sel.facts, (f) => periodKey(f.day, group));
    const rows = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, g]) => {
      const r = finish(g.acc);
      return withUtility({ key, label: periodLabel(key, group), ops: r.ops, gross: r.gross, discount: r.discount, net: r.net, avg: r.avg, cancelledOps: r.cancelledOps, cancelledAmount: r.cancelledAmount }, r);
    });
    return {
      columns: [{ id: 'label', label: GROUPS[group], type: 'text' }, ints('ops', 'Operaciones'), money('gross', 'Ventas brutas'), money('discount', 'Descuentos'),
        money('net', 'Ventas netas'), money('avg', 'Ticket promedio'), ints('cancelledOps', 'Canceladas'), money('cancelledAmount', 'Monto cancelado'), money('utility', 'Utilidad')],
      rows, totals: withUtility({ label: 'Total', ...total }, total),
      chart: { type: 'bars', labels: rows.map((r) => (group === 'month' ? r.label.slice(0, 3) : dm(r.key))), full: rows.map((r) => r.label), values: rows.map((r) => r.net) }
    };
  }

  if (view === 'product' || view === 'category') {
    const byProduct = view === 'product';
    const groups = groupFacts(sel.facts, (f) => (byProduct ? f.productId : f.categoryId));
    const rows = [...groups.entries()].map(([key, g]) => {
      const r = finish(g.acc);
      return withUtility({
        key, label: byProduct ? g.latest.name : (g.latest.categoryName || 'Sin categoría'),
        unit: g.latest.unit, qty: r.qty, ops: r.ops, gross: r.gross, discount: r.discount, net: r.net, pct: share(r.net), cancelledAmount: r.cancelledAmount
      }, r);
    }).sort((a, b) => b.net - a.net || b.cancelledAmount - a.cancelledAmount);
    const columns = [{ id: 'label', label: byProduct ? 'Producto' : 'Categoría', type: 'text' }];
    if (byProduct) columns.push({ id: 'unit', label: 'Unidad', type: 'text' });
    columns.push({ id: 'qty', label: 'Cantidad', type: 'qty' }, ints('ops', 'Operaciones'), money('gross', 'Ventas brutas'), money('discount', 'Descuentos'),
      money('net', 'Ventas netas'), { id: 'pct', label: '% de ventas', type: 'pct' }, money('cancelledAmount', 'Monto cancelado'), money('utility', 'Utilidad'));
    return {
      columns, rows, totals: withUtility({ label: 'Total', ...total, pct: total.net > 0 ? 100 : 0 }, total),
      chart: { type: 'rank', items: rows.filter((r) => r.net > 0).slice(0, 10).map((r) => ({ label: r.label, value: r.net, pct: r.pct })) }
    };
  }

  if (view === 'method') {
    const rowsMap = new Map();
    for (const { sale, facts, net } of sel.infos.values()) {
      const totalC = cents(sale.total);
      const factor = totalC > 0 ? net / totalC : 1; // si se filtra por producto o categoría, se toma la parte proporcional
      for (const [method, c] of methodShares(sale)) {
        const r = rowsMap.get(method) || { label: method, ops: new Set(), net: 0, cancelled: 0 };
        if (sale.status === 'cancelled') r.cancelled += c * factor; else { r.net += c * factor; r.ops.add(sale.id); }
        rowsMap.set(method, r);
      }
    }
    const totalNet = [...rowsMap.values()].reduce((a, r) => a + r.net, 0);
    const rows = [...rowsMap.values()].map((r) => ({
      label: r.label, ops: r.ops.size, net: Math.round(r.net) / 100, pct: totalNet > 0 ? (r.net / totalNet) * 100 : 0, cancelledAmount: Math.round(r.cancelled) / 100
    })).sort((a, b) => b.net - a.net);
    return {
      columns: [{ id: 'label', label: 'Método de pago', type: 'text' }, ints('ops', 'Operaciones'), money('net', 'Cobrado (neto)'), { id: 'pct', label: '% del total', type: 'pct' }, money('cancelledAmount', 'Monto cancelado')],
      rows, totals: { label: 'Total', ops: total.ops, net: Math.round(totalNet) / 100, pct: totalNet > 0 ? 100 : 0, cancelledAmount: total.cancelledAmount },
      chart: { type: 'rank', items: rows.filter((r) => r.net > 0).slice(0, 10).map((r) => ({ label: r.label, value: r.net, pct: r.pct })) }
    };
  }

  // detalle: una fila por venta
  const rows = [...sel.infos.values()].sort((a, b) => (a.sale.createdAt < b.sale.createdAt ? 1 : -1)).map(({ sale, facts }) => {
    const a = newAcc();
    facts.forEach((f) => { a.gross += f.gross; a.net += f.net; });
    return {
      folio: sale.folio, createdAt: sale.createdAt, customer: sale.customer || '', items: facts.length,
      gross: a.gross / 100, discount: (a.gross - a.net) / 100, net: a.net / 100,
      methods: [...new Set((sale.payments || []).map((p) => p.method))].join(' + '),
      status: sale.status === 'cancelled' ? 'Cancelada' : 'Completada', reason: sale.cancelled?.reason || ''
    };
  });
  return {
    columns: [{ id: 'folio', label: 'Folio', type: 'text' }, { id: 'createdAt', label: 'Fecha', type: 'datetime' }, { id: 'customer', label: 'Cliente', type: 'text' },
      ints('items', 'Artículos'), money('gross', 'Bruto'), money('discount', 'Descuento'), money('net', 'Total'),
      { id: 'methods', label: 'Métodos de pago', type: 'text' }, { id: 'status', label: 'Estado', type: 'text' }, { id: 'reason', label: 'Motivo de cancelación', type: 'text' }],
    rows,
    totals: { folio: 'Total completadas', ops: total.ops, gross: total.gross, discount: total.discount, net: total.net },
    chart: null
  };
}

// columnIds: null (todas, en su orden) o la lista de columnas visibles en el orden elegido.
// expenses: gastos (opcional). En el Resumen se suman junto a las ventas; los reportes de gastos solo usan gastos.
export function runReport(sales, filters, { timeZone = 'America/Mexico_City', view = 'summary', group = 'day', columnIds = null, expenses = [] } = {}) {
  const status = filters.status === 'completed' ? 'active' : filters.status === 'cancelled' ? 'cancelled' : 'all';
  if (isExpenseView(view)) {
    const list = selectExpenses(expenses, { from: filters.from, to: filters.to, method: filters.method, categoryId: filters.expenseCategoryId, status })
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1)));
    const table = buildExpenseTable(view, list);
    return { matched: list.length, summary: finish(newAcc()), table: { ...table, columns: pickColumns(table.columns, columnIds) } };
  }

  const sel = select(sales, filters, timeZone);
  let table = view === 'summary' ? null : buildTable(view, group, sel);
  if (table) table = { ...table, columns: pickColumns(table.columns, columnIds) };
  const summary = finish(accOf(sel.facts));

  // Gastos del mismo periodo. Con filtro de producto o categoría (solo aplican a ventas) o viendo solo canceladas no se mezclan.
  const inRange = selectExpenses(expenses, { from: filters.from, to: filters.to, method: filters.method });
  const mixable = !filters.productId && !filters.categoryId && filters.status !== 'cancelled';
  const exp = totalOf(inRange);
  summary.expenses = mixable ? { total: exp.total, count: exp.count, cancelled: inRange.length - exp.count } : null;
  // "Ventas menos gastos" solo es comparable sin filtro de método: con él, las ventas incluyen pagos de otros métodos.
  summary.result = mixable && !filters.method ? Math.round(summary.net * 100 - exp.cents) / 100 : null;
  return { matched: sel.infos.size + (view === 'summary' && mixable ? inRange.length : 0), summary, table };
}

/* ---------- Columnas y tarjetas configurables ---------- */

// Tarjetas del Resumen (se pueden mostrar, ocultar y reordenar).
export const SUMMARY_CARDS = [
  { id: 'gross', label: 'Ventas brutas' }, { id: 'discount', label: 'Descuentos' }, { id: 'net', label: 'Ventas netas' },
  { id: 'ops', label: 'Operaciones' }, { id: 'avg', label: 'Ticket promedio' }, { id: 'cancelled', label: 'Ventas canceladas' },
  { id: 'utility', label: 'Utilidad' }, { id: 'expenses', label: 'Gastos' }, { id: 'result', label: 'Ventas menos gastos' }
];

// Todas las columnas posibles de un reporte, en su orden por defecto. La primera (nombre) siempre se muestra.
export function viewColumns(view, group = 'day') {
  if (view === 'summary') return SUMMARY_CARDS;
  return buildTable(view, group, { facts: [], infos: new Map() }).columns;
}

// Deja solo las columnas elegidas, en ese orden. ids null = todas. Ids desconocidos se ignoran.
// lockFirst: la primera columna no se puede ocultar ni mover del primer lugar (el Resumen no la tiene).
export function pickColumns(all, ids, { lockFirst = true } = {}) {
  if (!Array.isArray(ids)) return all;
  const byId = new Map(all.map((c) => [c.id, c]));
  const out = [];
  for (const id of ids) if (byId.has(id)) { out.push(byId.get(id)); byId.delete(id); }
  if (lockFirst && all.length) {
    const first = all[0];
    const i = out.findIndex((c) => c.id === first.id);
    if (i > 0) out.splice(i, 1);
    if (i !== 0) out.unshift(first);
  }
  return out;
}

// Para el editor: columnas visibles en su orden, seguidas de las ocultas (con enabled: false).
export function columnsForEditor(all, ids, { lockFirst = true } = {}) {
  const visible = pickColumns(all, ids, { lockFirst });
  const shown = new Set(visible.map((c) => c.id));
  return [...visible.map((c) => ({ ...c, enabled: true })), ...all.filter((c) => !shown.has(c.id)).map((c) => ({ ...c, enabled: false }))];
}

// Texto y valor de la tarjeta de utilidad, siendo honestos con los costos que faltan.
export function utilityInfo(s, fmt) {
  if (s.utility === null) return { label: 'Utilidad', value: '—', note: 'Sin costos registrados. Agrega el costo unitario en el Catálogo para calcularla.' };
  if (s.utilityComplete) return { label: 'Utilidad', value: fmt(s.utility), note: `Ventas netas − costo (${fmt(s.cost)}). Costo conocido en el 100% de las ventas.` };
  return { label: 'Utilidad parcial', value: fmt(s.utility), note: `Solo con los artículos que tienen costo (${Math.round(s.costCoverage * 100)}% de las ventas netas). No es la utilidad total.` };
}

// Rangos rápidos (claves 'AAAA-MM-DD' en la zona horaria del negocio)
export function presetRange(preset, todayKey, helpers) {
  const { monthStart, prevMonthStart, lastDayOfMonth } = helpers;
  const ws = weekStart(todayKey);
  const pm = prevMonthStart(todayKey);
  switch (preset) {
    case 'today': return { from: todayKey, to: todayKey };
    case 'yesterday': return { from: addDays(todayKey, -1), to: addDays(todayKey, -1) };
    case 'week': return { from: ws, to: todayKey };
    case 'month': return { from: monthStart(todayKey), to: todayKey };
    case 'lastmonth': return { from: pm, to: addDays(pm, lastDayOfMonth(pm) - 1) };
    case 'last30': return { from: addDays(todayKey, -29), to: todayKey };
    default: return null;
  }
}

// CSV listo para Excel: coma como separador, comillas dobles escapadas y protección contra fórmulas.
// fmt.datetime(iso) da la fecha legible. Los números salen sin símbolo de moneda.
export function toCsv(table, fmt = {}) {
  const cell = (v, type) => {
    if (v === null || v === undefined || v === '') return '';
    let s;
    if (type === 'money') s = (Math.round(v * 100) / 100).toFixed(2);
    else if (type === 'pct') s = Number(v).toFixed(1);
    else if (type === 'qty') s = String(+Number(v).toFixed(3));
    else if (type === 'int') s = String(v);
    else if (type === 'date') s = `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}`;
    else {
      s = type === 'datetime' && fmt.datetime ? fmt.datetime(v) : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita que Excel ejecute texto como fórmula
    }
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [table.columns.map((c) => cell(c.label, 'text')).join(',')];
  for (const r of table.rows) lines.push(table.columns.map((c) => cell(r[c.id], c.type)).join(','));
  if (table.totals) lines.push(table.columns.map((c, i) => cell(table.totals[c.id] ?? (i === 0 ? 'Total' : ''), c.type)).join(','));
  return lines.join('\r\n');
}

export const PRESETS = {
  today: 'Hoy', yesterday: 'Ayer', week: 'Esta semana', month: 'Este mes',
  lastmonth: 'Mes pasado', last30: 'Últimos 30 días', custom: 'Personalizado'
};
