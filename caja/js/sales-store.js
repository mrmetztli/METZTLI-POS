// sales-store.js — reglas de negocio de las ventas (sin pantalla).
// Cálculo de totales, validación de pagos, folios, guardado atómico y cancelaciones.
// Todo el dinero se calcula en centavos enteros para evitar errores de redondeo.
import * as db from './database.js';
import { uid } from './utilities.js';
import { round2 } from './catalog-store.js';

const nowIso = () => new Date().toISOString();
const cents = (n) => Math.round(Number(n) * 100);
const round3 = (n) => Math.round(n * 1000) / 1000;

export const lineTotal = (unitPrice, qty) => Math.round(cents(unitPrice) * qty) / 100;

// lines: [{ unitPrice, qty }] · discount: { type: 'percent' | 'amount', value }
export function calcTotals(lines, discount = {}) {
  const subtotalC = lines.reduce((sum, l) => sum + Math.round(cents(l.unitPrice) * l.qty), 0);
  const value = Number(discount.value);
  let discountC = 0;
  if (Number.isFinite(value) && value > 0) {
    discountC = discount.type === 'amount'
      ? Math.min(cents(value), subtotalC)
      : Math.round(subtotalC * Math.min(value, 100) / 100);
  }
  return {
    subtotal: subtotalC / 100,
    discount: discountC / 100,
    total: (subtotalC - discountC) / 100
  };
}

// payments: [{ method, cash, amount }]. El cambio solo puede salir de pagos en efectivo.
export function validatePayments(total, payments) {
  const totalC = cents(total);
  const list = payments.filter((p) => Number(p.amount) !== 0);
  if (list.some((p) => !Number.isFinite(Number(p.amount)) || Number(p.amount) < 0)) {
    return { ok: false, error: 'Los montos de pago no pueden ser negativos.', paid: 0, change: 0, remaining: total, payments: [] };
  }
  if (totalC === 0) return { ok: true, error: '', paid: 0, change: 0, remaining: 0, payments: [] };

  const paidC = list.reduce((s, p) => s + cents(p.amount), 0);
  if (paidC < totalC) {
    return { ok: false, error: `Falta cobrar ${((totalC - paidC) / 100).toFixed(2)}`, paid: paidC / 100, change: 0, remaining: (totalC - paidC) / 100, payments: list };
  }
  const excessC = paidC - totalC;
  const cashC = list.filter((p) => p.cash).reduce((s, p) => s + cents(p.amount), 0);
  if (excessC > 0 && cashC < excessC) {
    return { ok: false, error: 'Solo se puede dar cambio cuando se paga en efectivo.', paid: paidC / 100, change: 0, remaining: 0, payments: list };
  }
  return { ok: true, error: '', paid: paidC / 100, change: excessC / 100, remaining: 0, payments: list };
}

// Tokens: {####} consecutivo (el número de # es el relleno de ceros) · {YYYY} {YY} {MM} {DD}
export function formatFolio(format, n, date = new Date(), timeZone = 'America/Mexico_City') {
  let f = String(format || 'V-{####}');
  if (!/\{#+\}/.test(f)) f += '-{####}'; // siempre debe llevar consecutivo para ser único
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).map((p) => [p.type, p.value])
  );
  return f
    .replace(/\{(#+)\}/g, (_, h) => String(n).padStart(h.length, '0'))
    .replaceAll('{YYYY}', parts.year).replaceAll('{YY}', parts.year.slice(2))
    .replaceAll('{MM}', parts.month).replaceAll('{DD}', parts.day);
}

export async function listSales() {
  const all = await db.getAll('sales');
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// input: { id, lines: [{ productId, qty, unitPrice }], discount, payments, customer, notes }
export async function createSale(input, config) {
  if (input.id) { // evita duplicar la venta si se pulsa dos veces
    const existing = await db.get('sales', input.id);
    if (existing) return existing;
  }
  if (!input.lines?.length) throw new Error('Agrega al menos un artículo a la venta.');
  const sales = config.sales;
  const discountValue = Number(input.discount?.value) || 0;
  if (!sales.discountsEnabled && discountValue > 0) throw new Error('Los descuentos están desactivados en Configuración.');

  const [products, categories] = await Promise.all([db.getAll('products'), db.getAll('categories')]);
  const items = [];
  const used = new Map(); // cantidad total por producto, para validar existencias
  for (const l of input.lines) {
    // Línea libre (monto libre / servicio sin producto del catálogo)
    if (l.custom || String(l.productId || '').startsWith('__free')) {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unitPrice);
      const name = String(l.name || 'Monto libre').trim() || 'Monto libre';
      if (!(qty > 0)) throw new Error(`Cantidad inválida en “${name}”.`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Precio inválido en “${name}”.`);
      items.push({
        productId: l.productId || '__free__',
        name,
        description: '',
        sku: '',
        unit: 'servicio',
        type: 'service',
        categoryId: '',
        categoryName: '',
        qty,
        listPrice: round2(unitPrice),
        unitPrice: round2(unitPrice),
        cost: 0,
        total: lineTotal(unitPrice, qty),
        custom: true
      });
      continue;
    }

    const p = products.find((x) => x.id === l.productId);
    if (!p) throw new Error('Un artículo del carrito ya no existe en el catálogo. Quítalo e inténtalo de nuevo.');
    if (!p.active) throw new Error(`“${p.name}” está archivado. Quítalo del carrito.`);
    const qty = Number(l.qty);
    if (!(qty > 0)) throw new Error(`Cantidad inválida en “${p.name}”.`);
    const unitPrice = Number(l.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Precio inválido en “${p.name}”.`);
    if (sales.priceEdit === 'deny' && round2(unitPrice) !== p.price) {
      throw new Error('Cambiar precios está desactivado en Configuración.');
    }
    const total = (used.get(p.id) || 0) + qty;
    used.set(p.id, total);
    if (p.trackStock && total > p.stock) throw new Error(`“${p.name}”: solo hay ${p.stock} ${p.unit} en existencias.`);

    const cat = categories.find((c) => c.id === p.categoryId);
    items.push({
      productId: p.id, name: p.name, description: p.description, sku: p.sku, unit: p.unit, type: p.type,
      categoryId: p.categoryId, categoryName: cat?.name || '',
      qty, listPrice: p.price, unitPrice: round2(unitPrice), cost: p.cost, total: lineTotal(unitPrice, qty)
    });
  }

  const totals = calcTotals(items, input.discount);
  const check = validatePayments(totals.total, input.payments || []);
  if (!check.ok) throw new Error(check.error);
  // IVA incluido en el precio: no cambia el total, solo se guarda el desglose con la tasa vigente al vender.
  const rate = Number(sales.tax?.rate);
  const tax = sales.tax?.enabled && rate > 0 && totals.total > 0
    ? { label: String(sales.tax.label || 'IVA'), rate, included: true, amount: round2(totals.total - totals.total / (1 + rate / 100)) }
    : null;

  // Solo ahora se reserva el folio, así un cobro inválido no gasta números.
  const counter = await db.update('meta', 'folioCounter', (cur) => ({ id: 'folioCounter', value: (cur?.value || 0) + 1 }));
  const createdAt = nowIso();
  const id = input.id || uid();
  const sale = {
    id, number: counter.value,
    folio: formatFolio(sales.folioFormat, counter.value, new Date(createdAt), config.timezone),
    createdAt, status: 'completed',
    items,
    subtotal: totals.subtotal,
    discount: { type: input.discount?.type === 'amount' ? 'amount' : 'percent', value: discountValue, amount: totals.discount },
    total: totals.total,
    payments: check.payments.map((p) => ({ method: p.method, cash: !!p.cash, amount: round2(p.amount) })),
    paid: check.paid, change: check.change,
    customer: String(input.customer || '').trim(),
    customerId: input.customerId ? String(input.customerId) : '',
    notes: String(input.notes || '').trim(),
    cancelled: null,
    tax
  };

  const ops = [{ store: 'sales', op: 'put', record: sale }];
  for (const [productId, qty] of used) {
    const p = products.find((x) => x.id === productId);
    if (p.trackStock) ops.push({ store: 'products', op: 'put', record: { ...p, stock: round3(p.stock - qty) } });
  }
  ops.push({ store: 'audit', op: 'put', record: { id: uid(), at: createdAt, action: 'crear', entity: 'venta', entityId: id, summary: `${sale.folio} · ${sale.total}` } });
  await db.batch(ops);
  return sale;
}

// rules: { enabled, maxDays } (de Configuración). Sin reglas, se permite cancelar.
export async function cancelSale(id, reason, rules = {}) {
  const text = String(reason || '').trim();
  if (text.length < 3) throw new Error('Escribe el motivo de la cancelación (mínimo 3 caracteres).');
  const sale = await db.get('sales', id);
  if (!sale) throw new Error('La venta ya no existe.');
  if (sale.status === 'cancelled') throw new Error('Esta venta ya estaba cancelada.');
  if (rules.enabled === false) throw new Error('La cancelación de ventas está desactivada en Configuración.');
  if (rules.maxDays > 0 && Date.now() - Date.parse(sale.createdAt) > rules.maxDays * 86400000) {
    throw new Error(`Esta venta tiene más de ${rules.maxDays} día(s); ya no se puede cancelar (límite en Configuración).`);
  }

  const products = await db.getAll('products');
  const restore = new Map();
  for (const item of sale.items) restore.set(item.productId, (restore.get(item.productId) || 0) + item.qty);

  const at = nowIso();
  const ops = [{ store: 'sales', op: 'put', record: { ...sale, status: 'cancelled', cancelled: { at, reason: text } } }];
  for (const [productId, qty] of restore) {
    const p = products.find((x) => x.id === productId);
    if (p?.trackStock) ops.push({ store: 'products', op: 'put', record: { ...p, stock: round3(p.stock + qty) } });
  }
  ops.push({ store: 'audit', op: 'put', record: { id: uid(), at, action: 'cancelar', entity: 'venta', entityId: id, summary: `${sale.folio} · ${text}` } });
  await db.batch(ops);
}
