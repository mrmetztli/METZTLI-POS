// demo-data.js — datos de PRUEBA claramente marcados (demo: true, folios "PRUEBA-0001").
// Sirven para ver cómo se ven el dashboard y los reportes. Se pueden quitar sin tocar tus datos reales.
import * as db from './database.js';
import { calcTotals, lineTotal, validatePayments } from './sales-store.js';
import { dateKey } from './dashboard-store.js';

const CATEGORIES = [
  { id: 'demo-cat-1', name: 'Bebidas (prueba)', icon: '☕', color: '#0f766e' },
  { id: 'demo-cat-2', name: 'Alimentos (prueba)', icon: '🍰', color: '#b45309' },
  { id: 'demo-cat-3', name: 'Servicios (prueba)', icon: '🔧', color: '#7e22ce' }
];
const EXPENSE_CATEGORIES = [
  { id: 'demo-ecat-1', name: 'Renta (prueba)', icon: '🏠', color: '#475569' },
  { id: 'demo-ecat-2', name: 'Servicios (prueba)', icon: '💡', color: '#b45309' },
  { id: 'demo-ecat-3', name: 'Insumos (prueba)', icon: '📦', color: '#1d4ed8' },
  { id: 'demo-ecat-4', name: 'Sueldos (prueba)', icon: '👥', color: '#0f766e' }
];
// [id, nombre, categoría, precio, costo|null, unidad, tipo, venta rápida, existencias|null, mínimo]
const PRODUCTS = [
  ['p1', 'Café americano', 0, 35, 9, 'pieza', 'product', true, null, 0], ['p2', 'Café latte', 0, 48, 14, 'pieza', 'product', true, null, 0],
  ['p3', 'Té chai', 0, 40, null, 'pieza', 'product', false, null, 0], ['p4', 'Agua natural', 0, 20, 8, 'pieza', 'product', true, 6, 10],
  ['p5', 'Pan dulce', 1, 18, 6, 'pieza', 'product', true, 40, 10], ['p6', 'Sándwich', 1, 65, 28, 'pieza', 'product', false, null, 0],
  ['p7', 'Rebanada de pastel', 1, 55, null, 'pieza', 'product', false, null, 0], ['p8', 'Impresión carta', 2, 3, 0.5, 'hoja', 'service', false, null, 0],
  ['p9', 'Diseño básico', 2, 250, null, 'servicio', 'service', false, null, 0], ['p10', 'Engargolado', 2, 45, 15, 'servicio', 'service', false, null, 0]
];

// Generador pseudoaleatorio con semilla: siempre produce los mismos datos de prueba.
function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildDemo(now = new Date(), days = 45) {
  const rand = rng(7);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const stamp = now.toISOString();
  const categories = CATEGORIES.map((c, i) => ({ ...c, description: '', order: 1000 + i, hidden: false, createdAt: stamp, updatedAt: stamp, demo: true }));
  const products = PRODUCTS.map(([id, name, cat, price, cost, unit, type, quick, stock, min]) => ({
    id: `demo-${id}`, name, description: '', sku: '', barcode: '', categoryId: CATEGORIES[cat].id, type, price, cost, image: null, active: true,
    color: CATEGORIES[cat].color, unit, trackStock: stock !== null, stock: stock ?? 0, minStock: min, quick, featured: false, createdAt: stamp, updatedAt: stamp, demo: true
  }));

  const drafts = [];
  for (let d = days - 1; d >= 0; d--) {
    const count = Math.floor(rand() * 5) + (d % 7 === 5 || d % 7 === 6 ? 1 : 0); // un poco más los fines de semana
    for (let k = 0; k < count; k++) {
      const at = new Date(now.getTime() - d * 86400000);
      at.setUTCHours(15 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0); // ≈ 9:00–19:59 hora del centro de México
      if (at > now) at.setTime(now.getTime() - 60000);
      drafts.push(at.toISOString());
    }
  }
  drafts.sort();

  const sales = drafts.map((createdAt, idx) => {
    const lines = [];
    const n = 1 + Math.floor(rand() * 3);
    while (lines.length < n) {
      const p = pick(products);
      if (lines.some((l) => l.productId === p.id)) continue;
      const qty = p.unit === 'hoja' ? 5 + Math.floor(rand() * 16) : 1 + Math.floor(rand() * (p.type === 'service' ? 1 : 3));
      const cat = categories.find((c) => c.id === p.categoryId);
      lines.push({ productId: p.id, name: p.name, description: '', sku: '', unit: p.unit, type: p.type, categoryId: p.categoryId, categoryName: cat.name,
        qty, listPrice: p.price, unitPrice: p.price, cost: p.cost, total: lineTotal(p.price, qty) });
    }
    const hasDiscount = rand() < 0.15;
    const discount = hasDiscount ? { type: 'percent', value: 10 } : { type: 'percent', value: 0 };
    const totals = calcTotals(lines, discount);
    const r = rand();
    let payments;
    if (r < 0.5) payments = [{ method: 'Efectivo', cash: true, amount: Math.ceil(totals.total / 50) * 50 }];
    else if (r < 0.8) payments = [{ method: 'Tarjeta', cash: false, amount: totals.total }];
    else if (r < 0.93) payments = [{ method: 'Transferencia', cash: false, amount: totals.total }];
    else { const half = Math.round(totals.total / 2); payments = [{ method: 'Tarjeta', cash: false, amount: half }, { method: 'Efectivo', cash: true, amount: Math.round((totals.total - half) * 100) / 100 }]; }
    const check = validatePayments(totals.total, payments);
    const cancelled = idx % 17 === 16;
    return {
      id: `demo-sale-${idx + 1}`, number: idx + 1, folio: `PRUEBA-${String(idx + 1).padStart(4, '0')}`, createdAt, status: cancelled ? 'cancelled' : 'completed',
      items: lines, subtotal: totals.subtotal, discount: { ...discount, amount: totals.discount }, total: totals.total,
      payments: check.payments.map((p) => ({ method: p.method, cash: !!p.cash, amount: Number(p.amount) })), paid: check.paid, change: check.change,
      customer: rand() < 0.2 ? 'Cliente de prueba' : '', notes: '', tax: null,
      cancelled: cancelled ? { at: createdAt, reason: 'Prueba: error de captura' } : null, demo: true
    };
  });

  // Gastos de prueba con su propio generador (semilla distinta) para no alterar las ventas de prueba.
  const rand2 = rng(11);
  const expenseCategories = EXPENSE_CATEGORIES.map((c, i) => ({ ...c, description: '', order: 1000 + i, hidden: false, createdAt: stamp, updatedAt: stamp, demo: true }));
  const expenses = [];
  const addExpense = (date, catIdx, concept, amount, method, cancelled = false) => {
    const n = expenses.length + 1;
    const c = expenseCategories[catIdx];
    const createdAt = `${date}T18:00:00.000Z`;
    expenses.push({
      id: `demo-exp-${n}`, number: n, folio: `PRUEBA-G${String(n).padStart(4, '0')}`, date, concept, amount: Math.round(amount * 100) / 100,
      categoryId: c.id, categoryName: c.name, categoryIcon: c.icon, method, supplier: 'Proveedor de prueba', notes: '',
      status: cancelled ? 'cancelled' : 'active', cancelled: cancelled ? { at: createdAt, reason: 'Prueba: captura duplicada' } : null,
      createdAt, updatedAt: createdAt, demo: true
    });
  };
  for (let d = days - 1; d >= 0; d--) {
    const date = dateKey(new Date(now.getTime() - d * 86400000).toISOString(), 'America/Mexico_City');
    const day = Number(date.slice(8, 10));
    if (day === 1) addExpense(date, 0, 'Renta del local (prueba)', 4500, 'Transferencia');
    if (day === 5) addExpense(date, 1, 'Luz e internet (prueba)', 650 + Math.floor(rand2() * 300), 'Tarjeta');
    if (day === 15) addExpense(date, 3, 'Sueldo quincenal (prueba)', 3200, 'Efectivo');
    if (rand2() < 0.3) addExpense(date, 2, 'Compra de insumos (prueba)', 150 + Math.floor(rand2() * 750), rand2() < 0.7 ? 'Efectivo' : 'Tarjeta', expenses.length % 9 === 8);
  }
  return { categories, products, sales, expenseCategories, expenses };
}

export async function hasDemo() {
  const [products, sales, expenses] = await Promise.all([db.getAll('products'), db.getAll('sales'), db.getAll('expenses')]);
  return products.some((p) => p.demo) || sales.some((s) => s.demo) || expenses.some((e) => e.demo);
}

export async function loadDemo(now = new Date()) {
  if (await hasDemo()) throw new Error('Ya hay datos de prueba cargados. Elimínalos primero si quieres cargarlos de nuevo.');
  const { categories, products, sales, expenseCategories, expenses } = buildDemo(now);
  await db.batch([
    ...expenseCategories.map((record) => ({ store: 'expenseCategories', op: 'put', record })),
    ...expenses.map((record) => ({ store: 'expenses', op: 'put', record })),
    ...categories.map((record) => ({ store: 'categories', op: 'put', record })),
    ...products.map((record) => ({ store: 'products', op: 'put', record })),
    ...sales.map((record) => ({ store: 'sales', op: 'put', record }))
  ]);
  return { categories: categories.length, products: products.length, sales: sales.length, expenses: expenses.length };
}

// Quita solo lo marcado como prueba. Si algo de prueba ya se usó en una venta real (o en un producto real),
// se conserva como dato normal para no dañar tu historial.
export async function removeDemo() {
  const [products, categories, sales, expenses, expenseCategories] = await Promise.all([
    db.getAll('products'), db.getAll('categories'), db.getAll('sales'), db.getAll('expenses'), db.getAll('expenseCategories')]);
  const realSales = sales.filter((s) => !s.demo);
  const usedProducts = new Set(realSales.flatMap((s) => s.items.map((i) => i.productId)));
  const ops = sales.filter((s) => s.demo).map((s) => ({ store: 'sales', op: 'delete', id: s.id }));
  const keptProducts = [];
  let productsRemoved = 0; let categoriesRemoved = 0;
  for (const p of products.filter((x) => x.demo)) {
    if (usedProducts.has(p.id)) { const { demo, ...rest } = p; ops.push({ store: 'products', op: 'put', record: rest }); keptProducts.push(rest); }
    else { ops.push({ store: 'products', op: 'delete', id: p.id }); productsRemoved += 1; }
  }
  const remaining = [...products.filter((p) => !p.demo), ...keptProducts];
  for (const c of categories.filter((x) => x.demo)) {
    if (remaining.some((p) => p.categoryId === c.id)) { const { demo, ...rest } = c; ops.push({ store: 'categories', op: 'put', record: rest }); }
    else { ops.push({ store: 'categories', op: 'delete', id: c.id }); categoriesRemoved += 1; }
  }
  // Gastos de prueba: se borran; sus categorías se conservan solo si un gasto real ya las usa.
  const realExpenses = expenses.filter((e) => !e.demo);
  for (const e of expenses.filter((x) => x.demo)) ops.push({ store: 'expenses', op: 'delete', id: e.id });
  for (const c of expenseCategories.filter((x) => x.demo)) {
    if (realExpenses.some((e) => e.categoryId === c.id)) { const { demo, ...rest } = c; ops.push({ store: 'expenseCategories', op: 'put', record: rest }); }
    else ops.push({ store: 'expenseCategories', op: 'delete', id: c.id });
  }
  if (ops.length) await db.batch(ops);
  return { sales: sales.length - realSales.length, expenses: expenses.length - realExpenses.length, products: productsRemoved, categories: categoriesRemoved, kept: keptProducts.length };
}
