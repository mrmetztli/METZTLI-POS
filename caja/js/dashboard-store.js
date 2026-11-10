// dashboard-store.js — cálculo de indicadores a partir de las ventas reales (sin pantalla).
// Solo cuentan las ventas completadas; las canceladas se cuentan aparte y no suman.
// Los días se calculan en la zona horaria de Configuración. La semana empieza en lunes.

const fmtCache = new Map();
function formatter(tz, kind) {
  const key = `${tz}|${kind}`;
  if (!fmtCache.has(key)) {
    fmtCache.set(key, kind === 'day'
      ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      : new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }));
  }
  return fmtCache.get(key);
}

export const dateKey = (iso, tz) => formatter(tz, 'day').format(new Date(iso)); // 'AAAA-MM-DD'
export const hourOf = (iso, tz) => Number(formatter(tz, 'hour').format(new Date(iso)));

export function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayNumber = (key) => Number(key.slice(8, 10));
export const monthStart = (key) => `${key.slice(0, 8)}01`;
export const weekStart = (key) => addDays(key, -((new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7));
export const prevMonthStart = (key) => monthStart(addDays(monthStart(key), -1));
export const lastDayOfMonth = (key) => dayNumber(addDays(monthStart(addDays(monthStart(key), 31)), -1));
const diffDays = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

// Con base negativa (p. ej. "ventas menos gastos" en pérdida) se divide entre el valor absoluto para que subir siga siendo ▲.
export const pctChange = (cur, prev) => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// period: 'day' | 'week' | 'month'
// expenses: lista de gastos (opcional). Sus fechas ya son días contables en la zona del negocio; los cancelados no suman.
export function computeDashboard(sales, { now = new Date(), timeZone = 'America/Mexico_City', period = 'month', expenses = [] } = {}) {
  const todayKey = dateKey(now.toISOString(), timeZone);

  // Acumulados por día, en centavos para no arrastrar errores de decimales.
  const days = new Map();
  const cancelledByDay = new Map();
  const completed = [];
  for (const s of sales) {
    const k = dateKey(s.createdAt, timeZone);
    if (s.status === 'cancelled') { cancelledByDay.set(k, (cancelledByDay.get(k) || 0) + 1); continue; }
    completed.push({ s, k });
    const d = days.get(k) || { total: 0, count: 0, discount: 0, qty: 0 };
    d.qty += s.items.reduce((sum, i) => sum + i.qty, 0);
    d.total += Math.round(s.total * 100);
    d.discount += Math.round((s.discount?.amount || 0) * 100);
    d.count += 1;
    days.set(k, d);
  }

  function range(a, b) {
    let total = 0; let count = 0; let discount = 0; let cancelled = 0; let qty = 0;
    for (let k = a; k <= b; k = addDays(k, 1)) {
      const d = days.get(k);
      if (d) { total += d.total; count += d.count; discount += d.discount; qty += d.qty; }
      cancelled += cancelledByDay.get(k) || 0;
    }
    return { total: total / 100, count, avg: count ? Math.round(total / count) / 100 : 0, discount: discount / 100, cancelled, units: Math.round(qty * 1000) / 1000 };
  }

  // Periodo actual y el anterior "del mismo tramo" (mismos días transcurridos), para comparar parejo.
  const ms = monthStart(todayKey);
  const pms = prevMonthStart(todayKey);
  const elapsedMonth = dayNumber(todayKey);
  const ws = weekStart(todayKey);
  const pws = addDays(ws, -7);
  const elapsedWeek = diffDays(ws, todayKey) + 1;
  const yesterday = addDays(todayKey, -1);

  const spans = {
    day: { cur: [todayKey, todayKey], prev: [yesterday, yesterday] },
    week: { cur: [ws, todayKey], prev: [pws, addDays(pws, elapsedWeek - 1)] },
    month: { cur: [ms, todayKey], prev: [pms, addDays(pms, Math.min(elapsedMonth, lastDayOfMonth(pms)) - 1)] }
  };
  const span = spans[period] || spans.month;

  const today = { ...range(todayKey, todayKey), prev: range(yesterday, yesterday) };
  const month = { ...range(ms, todayKey), prev: range(...spans.month.prev) };
  const cur = range(...span.cur);
  const prev = range(...span.prev);

  // Gráfica: periodo completo actual y anterior, alineados por posición.
  const chart = { labels: [], full: [], current: [], previous: [], show: [] };
  const sumDay = (k) => (days.get(k)?.total || 0) / 100;
  if (period === 'day') {
    const byHour = (key) => {
      const arr = Array(24).fill(0);
      for (const { s, k } of completed) if (k === key) arr[hourOf(s.createdAt, timeZone)] += Math.round(s.total * 100);
      return arr.map((c) => c / 100);
    };
    chart.current = byHour(todayKey);
    chart.previous = byHour(yesterday);
    for (let h = 0; h < 24; h++) { chart.labels.push(`${h}h`); chart.full.push(`${h}:00 – ${h}:59`); chart.show.push(h % 3 === 0); }
  } else if (period === 'week') {
    for (let i = 0; i < 7; i++) {
      const k = addDays(ws, i);
      chart.current.push(k <= todayKey ? sumDay(k) : 0);
      chart.previous.push(sumDay(addDays(pws, i)));
      chart.labels.push(WEEKDAYS[i]);
      chart.full.push(`${WEEKDAYS[i]} ${dayNumber(k)} ${MONTHS[Number(k.slice(5, 7)) - 1]}`);
      chart.show.push(true);
    }
  } else {
    const n = lastDayOfMonth(todayKey);
    const pn = lastDayOfMonth(pms);
    for (let i = 0; i < n; i++) {
      const k = addDays(ms, i);
      chart.current.push(k <= todayKey ? sumDay(k) : 0);
      chart.previous.push(i < pn ? sumDay(addDays(pms, i)) : 0);
      chart.labels.push(String(i + 1));
      chart.full.push(`${i + 1} ${MONTHS[Number(ms.slice(5, 7)) - 1]}`);
      chart.show.push(i === 0 || (i + 1) % 5 === 0);
    }
  }

  // Productos y categorías del periodo. El descuento de la venta se reparte entre sus artículos
  // para que los importes sumen exactamente las ventas netas.
  const products = new Map();
  const categories = new Map();
  for (const { s, k } of completed) {
    if (k < span.cur[0] || k > span.cur[1]) continue;
    const factor = s.subtotal > 0 ? s.total / s.subtotal : 0;
    for (const i of s.items) {
      const amount = i.total * factor;
      const p = products.get(i.productId) || { productId: i.productId, name: i.name, unit: i.unit, qty: 0, amount: 0 };
      p.qty += i.qty; p.amount += amount; p.name = i.name; p.unit = i.unit;
      products.set(i.productId, p);
      const ck = i.categoryId || '';
      const c = categories.get(ck) || { id: ck, name: i.categoryName || 'Sin categoría', amount: 0 };
      c.amount += amount;
      categories.set(ck, c);
    }
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  const top = [...products.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map((p) => ({ ...p, qty: Math.round(p.qty * 1000) / 1000, amount: round2(p.amount) }));
  const catTotal = [...categories.values()].reduce((sum, c) => sum + c.amount, 0);
  const byCategory = [...categories.values()].sort((a, b) => b.amount - a.amount)
    .map((c) => ({ ...c, amount: round2(c.amount), pct: catTotal ? (c.amount / catTotal) * 100 : 0 }));

  const recent = completed.map((x) => x.s).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);

  // Índice del último punto con datos reales (la gráfica de líneas no baja a cero en días que aún no llegan).
  chart.last = period === 'day' ? hourOf(now.toISOString(), timeZone) : period === 'week' ? diffDays(ws, todayKey) : dayNumber(todayKey) - 1;

  // Gastos del mismo tramo que las ventas, para comparar parejo y calcular "ventas − gastos".
  const expDays = new Map();
  const expActive = [];
  for (const e of expenses) {
    if (e.status === 'cancelled') continue;
    expActive.push(e);
    const d = expDays.get(e.date) || { total: 0, count: 0 };
    d.total += Math.round(e.amount * 100);
    d.count += 1;
    expDays.set(e.date, d);
  }
  const expRange = (a, b) => {
    let total = 0; let count = 0;
    for (let k = a; k <= b; k = addDays(k, 1)) { const d = expDays.get(k); if (d) { total += d.total; count += d.count; } }
    return { total: total / 100, count };
  };
  const exCur = expRange(...span.cur);
  const exPrev = expRange(...span.prev);
  const expCats = new Map();
  for (const e of expActive) {
    if (e.date < span.cur[0] || e.date > span.cur[1]) continue;
    const c = expCats.get(e.categoryId) || { id: e.categoryId, name: e.categoryName || 'Sin categoría', cents: 0 };
    c.cents += Math.round(e.amount * 100); c.name = e.categoryName || c.name;
    expCats.set(e.categoryId, c);
  }
  const expCatTotal = [...expCats.values()].reduce((sum, c) => sum + c.cents, 0);
  const expensesData = {
    hasAny: expenses.length > 0,
    today: { ...expRange(todayKey, todayKey), prev: expRange(yesterday, yesterday) },
    month: { ...expRange(ms, todayKey), prev: expRange(...spans.month.prev) },
    period: { ...exCur, prev: exPrev },
    byCategory: [...expCats.values()].sort((a, b) => b.cents - a.cents).map((c) => ({ id: c.id, name: c.name, amount: c.cents / 100, pct: expCatTotal ? (c.cents / expCatTotal) * 100 : 0 })),
    recent: [...expActive].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1))).slice(0, 5)
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  const result = { value: r2(cur.total - exCur.total), prev: r2(prev.total - exPrev.total) };

  return { hasSales: completed.length > 0, todayKey, today, month, period: { key: period, from: span.cur[0], to: span.cur[1], ...cur, prev }, chart, top, byCategory, recent, expenses: expensesData, result };
}

// Agrupa los bloques visibles del dashboard en "filas" para dibujarlos:
//  · tarjetas de indicadores consecutivas → una cuadrícula ('kpis')
//  · bloques de tamaño "mitad" consecutivos → dos columnas ('half')
//  · bloques de ancho completo → solos ('full')
// widgets: [{ id, enabled, size }] · kindOf(id) → 'kpi' | 'block' | undefined (id desconocido: se ignora)
export function layoutRuns(widgets, kindOf) {
  const runs = [];
  for (const w of widgets) {
    if (!w.enabled) continue;
    const kind = kindOf(w.id);
    if (!kind) continue;
    const type = kind === 'kpi' ? 'kpis' : (w.size === 'half' ? 'half' : 'full');
    const last = runs[runs.length - 1];
    if (type !== 'full' && last && last.type === type) last.ids.push(w.id);
    else runs.push({ type, ids: [w.id] });
  }
  return runs;
}
