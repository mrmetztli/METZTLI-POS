// catalog-store.js — reglas de negocio del catálogo (sin pantalla).
// Aquí viven las validaciones y el guardado de productos y categorías.
// catalog.js y categories.js solo dibujan y llaman a estas funciones.
import * as db from './database.js';
import { uid } from './utilities.js';

const nowIso = () => new Date().toISOString();
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Historial de operaciones (tabla "audit"). Si falla, no bloquea el guardado.
async function audit(action, entity, entityId, summary) {
  try {
    await db.put('audit', { id: uid(), at: nowIso(), action, entity, entityId, summary });
  } catch (e) {
    console.warn('No se pudo registrar en el historial', e);
  }
}

/* ============ Categorías ============ */

export async function listCategories() {
  const all = await db.getAll('categories');
  return all.sort((a, b) => a.order - b.order);
}

export async function saveCategory(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la categoría.');
  const all = await listCategories();
  if (all.some((c) => c.id !== input.id && c.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('Ya existe una categoría con ese nombre.');
  }
  const existing = input.id ? all.find((c) => c.id === input.id) : null;
  if (input.id && !existing) throw new Error('La categoría ya no existe.');
  const rec = {
    id: existing?.id || uid(),
    name,
    description: String(input.description || '').trim(),
    color: input.color || '#475569',
    icon: input.icon || '🏷️',
    order: existing ? existing.order : all.reduce((m, c) => Math.max(m, c.order), 0) + 1,
    hidden: existing ? existing.hidden : false,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    ...(existing?.demo ? { demo: true } : {}) // editar un dato de prueba no le quita la marca
  };
  await db.put('categories', rec);
  await audit(existing ? 'editar' : 'crear', 'categoría', rec.id, rec.name);
  return rec;
}

export async function moveCategory(id, direction) {
  const all = await listCategories();
  const i = all.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  all.forEach((c, k) => { c.order = k + 1; });
  await db.putMany('categories', all);
}

export async function setCategoryHidden(id, hidden) {
  const cat = await db.get('categories', id);
  if (!cat) throw new Error('La categoría ya no existe.');
  await db.put('categories', { ...cat, hidden: !!hidden, updatedAt: nowIso() });
  await audit(hidden ? 'ocultar' : 'mostrar', 'categoría', id, cat.name);
}

export async function deleteCategory(id) {
  const products = await db.getAll('products');
  const n = products.filter((p) => p.categoryId === id).length;
  if (n) {
    throw new Error(`Esta categoría tiene ${n} producto(s). Cámbialos de categoría u oculta la categoría en lugar de eliminarla.`);
  }
  const cat = await db.get('categories', id);
  await db.remove('categories', id);
  await audit('eliminar', 'categoría', id, cat?.name || '');
}

/* ============ Productos y servicios ============ */

export const listProducts = () => db.getAll('products');

export const isLowStock = (p) => !!p.trackStock && p.type === 'product' && p.stock <= p.minStock;

const toNumber = (v) => (v === '' || v == null ? NaN : Number(v));

export async function saveProduct(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Escribe el nombre del producto o servicio.');
  if (name.length > 80) throw new Error('El nombre es demasiado largo (máximo 80 caracteres).');

  const price = toNumber(input.price);
  if (!Number.isFinite(price) || price < 0) throw new Error('Escribe un precio de venta válido (0 o más).');

  let cost = null;
  if (input.cost !== '' && input.cost != null) {
    cost = Number(input.cost);
    if (!Number.isFinite(cost) || cost < 0) throw new Error('El costo debe ser un número de 0 o más.');
  }

  const type = input.type === 'service' ? 'service' : 'product';
  const trackStock = type === 'product' && !!input.trackStock;
  let stock = 0;
  let minStock = 0;
  if (trackStock) {
    stock = input.stock === '' || input.stock == null ? 0 : Number(input.stock);
    minStock = input.minStock === '' || input.minStock == null ? 0 : Number(input.minStock);
    if (!Number.isFinite(stock) || stock < 0) throw new Error('Las existencias deben ser un número de 0 o más.');
    if (!Number.isFinite(minStock) || minStock < 0) throw new Error('Las existencias mínimas deben ser un número de 0 o más.');
  }

  const all = await listProducts();
  const sku = String(input.sku || '').trim();
  if (sku && all.some((p) => p.id !== input.id && String(p.sku).toLowerCase() === sku.toLowerCase())) {
    throw new Error('Ya existe otro producto con ese SKU o código interno.');
  }

  const existing = input.id ? all.find((p) => p.id === input.id) : null;
  if (input.id && !existing) throw new Error('El producto ya no existe.');

  const image = typeof input.image === 'string' && input.image.startsWith('data:image/') ? input.image : null;
  const rec = {
    id: existing?.id || uid(),
    name,
    description: String(input.description || '').trim(),
    sku,
    barcode: String(input.barcode || '').trim(),
    categoryId: input.categoryId || '',
    type,
    price: round2(price),
    cost: cost === null ? null : round2(cost),
    image,
    active: existing ? existing.active : true,
    color: input.color || '#1d4ed8',
    unit: String(input.unit || '').trim() || (type === 'service' ? 'servicio' : 'pieza'),
    trackStock,
    stock,
    minStock,
    quick: !!input.quick,
    featured: !!input.featured,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    ...(existing?.demo ? { demo: true } : {})
  };
  await db.put('products', rec);
  await audit(existing ? 'editar' : 'crear', 'producto', rec.id, rec.name);
  return rec;
}

export async function duplicateProduct(id) {
  const src = await db.get('products', id);
  if (!src) throw new Error('El producto ya no existe.');
  const copy = {
    ...src,
    id: uid(),
    name: `${src.name} (copia)`.slice(0, 80),
    sku: '',
    barcode: '',
    stock: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await db.put('products', copy);
  await audit('duplicar', 'producto', copy.id, `${src.name} → ${copy.name}`);
  return copy;
}

export async function setProductActive(id, active) {
  const p = await db.get('products', id);
  if (!p) throw new Error('El producto ya no existe.');
  await db.put('products', { ...p, active: !!active, updatedAt: nowIso() });
  await audit(active ? 'reactivar' : 'archivar', 'producto', id, p.name);
}

// Eliminar solo es seguro si ninguna venta lo usa; si no, se debe archivar.
export async function deleteProduct(id) {
  const sales = await db.getAll('sales');
  const used = sales.some((s) => (s.items || []).some((i) => i.productId === id));
  if (used) {
    throw new Error('Este producto aparece en ventas registradas, así que no se puede eliminar. Archívalo: dejará de mostrarse al vender y tu historial se conserva.');
  }
  const p = await db.get('products', id);
  await db.remove('products', id);
  await audit('eliminar', 'producto', id, p?.name || '');
}

/* ============ Orden, páginas y venta rápida (los usan Catálogo y Nueva venta) ============ */

export const SORTS = {
  name: 'Nombre (A–Z)', nameDesc: 'Nombre (Z–A)', priceAsc: 'Precio: menor a mayor',
  priceDesc: 'Precio: mayor a menor', recent: 'Más recientes', stockAsc: 'Existencias: menos primero'
};

export function sortProducts(list, sort = 'name', featuredFirst = false) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'es');
  const stock = (p) => (p.trackStock ? p.stock : Infinity); // sin inventario, al final
  const compare = {
    name: byName,
    nameDesc: (a, b) => byName(b, a),
    priceAsc: (a, b) => a.price - b.price || byName(a, b),
    priceDesc: (a, b) => b.price - a.price || byName(a, b),
    recent: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : byName(a, b)),
    stockAsc: (a, b) => (stock(a) === stock(b) ? byName(a, b) : stock(a) - stock(b))
  }[sort] || byName;
  return [...list].sort((a, b) => (featuredFirst && !!a.featured !== !!b.featured ? (a.featured ? -1 : 1) : compare(a, b)));
}

// perPage 0 = todos. Devuelve la página pedida (empezando en 1).
export function paginate(list, page = 1, perPage = 0) {
  if (!perPage) return { items: list, pages: 1, page: 1 };
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const p = Math.min(Math.max(1, page), pages);
  return { items: list.slice((p - 1) * perPage, p * perPage), pages, page: p };
}

// Botones de venta rápida: primero los del orden elegido, luego el resto por nombre.
export function orderQuick(products, order = []) {
  const quick = products.filter((p) => p.quick && p.active);
  const pos = (p) => { const i = order.indexOf(p.id); return i === -1 ? Infinity : i; };
  return quick.sort((a, b) => (pos(a) === pos(b) ? a.name.localeCompare(b.name, 'es') : pos(a) - pos(b)));
}

// Agrega o quita un producto de los botones de venta rápida (el orden se guarda en la configuración del catálogo).
export async function setQuick(id, quick) {
  const p = await db.get('products', id);
  if (!p) throw new Error('El producto ya no existe.');
  await db.put('products', { ...p, quick: !!quick, updatedAt: nowIso() });
  await audit(quick ? 'agregar a venta rápida' : 'quitar de venta rápida', 'producto', id, p.name);
}
