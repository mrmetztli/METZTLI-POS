// catalogStore.js — lógica de datos del catálogo (sin pantallas).
// Reglas: validar, evitar duplicados, y nunca borrar un producto que ya tiene ventas.
// Convención para la Etapa 3: cada venta guarda sus renglones en sale.items[]
// y cada renglón incluye "productId" (así se detecta si un producto ya se vendió).
import * as db from './database.js';
import { uid } from './utilities.js';

const now = () => new Date().toISOString();
const text = (v) => String(v ?? '').trim();
const round2 = (n) => Math.round(n * 100) / 100;
export const normalizeText = (s) => text(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = normalizeText;

async function logAudit(action, entity, rec) {
  try {
    await db.put('audit', { id: uid(), at: now(), action, entity, entityId: rec.id, detail: rec.name });
  } catch (e) { console.warn('No se pudo registrar en auditoría', e); }
}

export const isLowStock = (p) => p.type === 'product' && p.trackStock && Number(p.stock) <= Number(p.minStock);

// ---------- Categorías ----------
export async function listCategories() {
  const all = await db.getAll('categories');
  return all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'es'));
}

export async function saveCategory(input) {
  const name = text(input.name);
  if (!name) throw new Error('Escribe el nombre de la categoría.');
  const cats = await db.getAll('categories');
  if (cats.some((c) => c.id !== input.id && norm(c.name) === norm(name))) {
    throw new Error('Ya existe una categoría con ese nombre.');
  }
  const existing = cats.find((c) => c.id === input.id);
  const rec = {
    id: existing?.id || uid(),
    name,
    description: text(input.description),
    color: input.color || '#64748b',
    icon: input.icon || '',
    hidden: existing?.hidden || false,
    demo: existing?.demo || false,
    order: existing ? existing.order : cats.reduce((m, c) => Math.max(m, c.order ?? 0), -1) + 1,
    createdAt: existing?.createdAt || now(),
    updatedAt: now()
  };
  await db.put('categories', rec);
  return rec;
}

export async function moveCategory(id, direction) {
  const cats = await listCategories();
  const i = cats.findIndex((c) => c.id === id);
  const j = i + (direction === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  cats.forEach((c, k) => { c.order = k; });
  await db.putMany('categories', cats);
}

export async function setCategoryHidden(id, hidden) {
  const c = await db.get('categories', id);
  if (!c) return;
  await db.put('categories', { ...c, hidden, updatedAt: now() });
}

export async function deleteCategory(id) {
  const products = await db.getAll('products');
  const used = products.filter((p) => p.categoryId === id).length;
  if (used > 0) return { ok: false, used };
  const c = await db.get('categories', id);
  await db.remove('categories', id);
  if (c) await logAudit('delete', 'category', c);
  return { ok: true };
}

// ---------- Productos y servicios ----------
export const listProducts = () => db.getAll('products');

export async function saveProduct(input) {
  const name = text(input.name);
  if (!name) throw new Error('Escribe el nombre del producto o servicio.');

  const price = Number(input.price);
  if (input.price === '' || !Number.isFinite(price) || price < 0) {
    throw new Error('El precio debe ser un número igual o mayor a 0.');
  }
  let cost = null;
  if (input.cost !== '' && input.cost != null) {
    cost = Number(input.cost);
    if (!Number.isFinite(cost) || cost < 0) throw new Error('El costo debe ser un número igual o mayor a 0.');
    cost = round2(cost);
  }

  const type = input.type === 'service' ? 'service' : 'product';
  const trackStock = type === 'product' && !!input.trackStock;
  let stock = 0;
  let minStock = 0;
  if (trackStock) {
    stock = Number(input.stock === '' ? 0 : input.stock);
    minStock = Number(input.minStock === '' ? 0 : input.minStock);
    if (!Number.isFinite(stock) || stock < 0) throw new Error('Las existencias deben ser un número igual o mayor a 0.');
    if (!Number.isFinite(minStock) || minStock < 0) throw new Error('Las existencias mínimas deben ser un número igual o mayor a 0.');
  }

  const all = await db.getAll('products');
  const sku = text(input.sku);
  const barcode = text(input.barcode);
  if (sku && all.some((p) => p.id !== input.id && norm(p.sku) === norm(sku))) throw new Error('Ese SKU ya lo usa otro producto.');
  if (barcode && all.some((p) => p.id !== input.id && text(p.barcode) === barcode)) throw new Error('Ese código de barras ya lo usa otro producto.');

  const existing = all.find((p) => p.id === input.id);
  const active = !!input.active;
  const rec = {
    ...(existing || {}),
    id: existing?.id || uid(),
    name,
    description: text(input.description),
    sku,
    barcode,
    categoryId: input.categoryId || null,
    type,
    price: round2(price),
    cost,
    image: input.image || null,
    active,
    archived: active ? false : (existing?.archived || false),
    color: input.color || '#64748b',
    icon: input.icon || '',
    unit: text(input.unit) || 'pieza',
    trackStock,
    stock,
    minStock,
    featured: !!input.featured,
    demo: existing?.demo || false,
    createdAt: existing?.createdAt || now(),
    updatedAt: now()
  };
  await db.put('products', rec);
  return rec;
}

async function patchProduct(id, patch, auditAction) {
  const p = await db.get('products', id);
  if (!p) throw new Error('El producto ya no existe.');
  const next = { ...p, ...patch, updatedAt: now() };
  await db.put('products', next);
  if (auditAction) await logAudit(auditAction, 'product', next);
  return next;
}

export const setProductActive = (id, active) => patchProduct(id, { active, archived: active ? false : undefined }, active ? 'activate' : 'deactivate');
export const setProductArchived = (id, archived) => patchProduct(id, { archived, active: archived ? false : true }, archived ? 'archive' : 'restore');
export async function toggleFeatured(id) {
  const p = await db.get('products', id);
  return patchProduct(id, { featured: !p.featured });
}

export async function duplicateProduct(id) {
  const p = await db.get('products', id);
  if (!p) throw new Error('El producto ya no existe.');
  const copy = { ...p, id: uid(), name: `${p.name} (copia)`, sku: '', barcode: '', featured: false, createdAt: now(), updatedAt: now() };
  await db.put('products', copy);
  return copy;
}

export async function countSalesFor(productId) {
  const sales = await db.getAll('sales');
  return sales.filter((s) => (s.items || []).some((i) => i.productId === productId)).length;
}

// Elimina solo si es seguro. Si ya tiene ventas, avisa para que se archive.
export async function deleteProduct(id) {
  const salesCount = await countSalesFor(id);
  if (salesCount > 0) return { ok: false, salesCount };
  const p = await db.get('products', id);
  await db.remove('products', id);
  if (p) await logAudit('delete', 'product', p);
  return { ok: true };
}

// ---------- Datos de ejemplo (siempre marcados con demo:true) ----------
function blank(o) {
  const t = now();
  return {
    id: uid(), name: '', description: '', sku: '', barcode: '', categoryId: null, type: 'product',
    price: 0, cost: null, image: null, active: true, archived: false, color: '#64748b', icon: '',
    unit: 'pieza', trackStock: false, stock: 0, minStock: 0, featured: false, demo: true,
    createdAt: t, updatedAt: t, ...o
  };
}

export async function loadDemoData() {
  const existing = await db.getAll('categories');
  const base = existing.reduce((m, c) => Math.max(m, c.order ?? 0), -1) + 1;
  const mk = (name, icon, color, i) => ({
    id: uid(), name, description: 'Datos de ejemplo', color, icon, hidden: false, demo: true,
    order: base + i, createdAt: now(), updatedAt: now()
  });
  const bebidas = mk('Bebidas (ejemplo)', '☕', '#8b5e3c', 0);
  const alimentos = mk('Alimentos (ejemplo)', '🥐', '#d97706', 1);
  const servicios = mk('Servicios (ejemplo)', '🔧', '#0f766e', 2);
  const products = [
    blank({ name: 'Café americano', sku: 'EJ-001', categoryId: bebidas.id, price: 35, cost: 9, icon: '☕', color: '#8b5e3c', featured: true }),
    blank({ name: 'Capuchino', sku: 'EJ-002', categoryId: bebidas.id, price: 45, cost: 12, icon: '☕', color: '#8b5e3c' }),
    blank({ name: 'Té de manzanilla', sku: 'EJ-003', categoryId: bebidas.id, price: 30, icon: '🍵', color: '#65a30d' }),
    blank({ name: 'Botella de agua', sku: 'EJ-004', categoryId: bebidas.id, price: 15, cost: 7, icon: '🥤', color: '#0284c7', trackStock: true, stock: 4, minStock: 6 }),
    blank({ name: 'Pan dulce', sku: 'EJ-005', categoryId: alimentos.id, price: 18, cost: 8, icon: '🥐', color: '#d97706', trackStock: true, stock: 30, minStock: 10 }),
    blank({ name: 'Sándwich de jamón', sku: 'EJ-006', categoryId: alimentos.id, price: 65, cost: 28, icon: '🥪', color: '#d97706' }),
    blank({ name: 'Servicio a domicilio', sku: 'EJ-007', categoryId: servicios.id, type: 'service', unit: 'servicio', price: 40, icon: '🚚', color: '#0f766e' }),
    blank({ name: 'Reparación básica', sku: 'EJ-008', categoryId: servicios.id, type: 'service', unit: 'hora', price: 250, icon: '🔧', color: '#0f766e' })
  ];
  await db.putMany('categories', [bebidas, alimentos, servicios]);
  await db.putMany('products', products);
}

// Quita los datos de ejemplo. Si alguno ya tiene ventas, se archiva en lugar de borrarse.
export async function removeDemoData() {
  const products = (await db.getAll('products')).filter((p) => p.demo);
  let removed = 0;
  let archived = 0;
  for (const p of products) {
    if ((await countSalesFor(p.id)) > 0) { await setProductArchived(p.id, true); archived++; }
    else { await db.remove('products', p.id); removed++; }
  }
  const left = await db.getAll('products');
  for (const c of (await db.getAll('categories')).filter((x) => x.demo)) {
    if (!left.some((p) => p.categoryId === c.id)) await db.remove('categories', c.id);
  }
  return { removed, archived };
}
