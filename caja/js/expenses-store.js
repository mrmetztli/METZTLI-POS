// expenses-store.js — reglas de negocio de los gastos (sin pantalla): categorías, alta, edición y cancelación.
// Todo guardado importante es atómico (gasto + folio + historial) y el dinero se maneja en centavos.
// Los cálculos de resúmenes están en expenses-calc.js.
import * as db from './database.js';
import { uid } from './utilities.js';
import { round2 } from './catalog-store.js';
import { formatFolio } from './sales-store.js';
import { dateKey } from './dashboard-store.js';

const nowIso = () => new Date().toISOString();
export const MAX_AMOUNT = 100000000;

/* ============ Categorías de gasto ============ */

// Categorías que se crean la primera vez. Se pueden editar, ocultar o eliminar (si no tienen gastos).
export const DEFAULT_CATEGORIES = [
  ['rent', 'Renta', '🏠', '#475569'], ['utilities', 'Luz, agua e internet', '💡', '#b45309'],
  ['payroll', 'Sueldos', '👥', '#0f766e'], ['supplies', 'Insumos y mercancía', '📦', '#1d4ed8'],
  ['transport', 'Transporte', '🚚', '#7e22ce'], ['maintenance', 'Mantenimiento', '🔧', '#4d7c0f'],
  ['marketing', 'Publicidad', '📣', '#be185d'], ['taxes', 'Impuestos y comisiones', '🧾', '#b91c1c'],
  ['other', 'Otros', '📌', '#64748b']
];

let seeding = null;

// Crea las categorías iniciales una sola vez (la marca queda en "meta"; si las borras, no vuelven a aparecer).
export function ensureDefaultCategories() {
  if (!seeding) {
    seeding = (async () => {
      if (await db.get('meta', 'expenseCatsSeeded')) return;
      const existing = new Set((await db.getAll('expenseCategories')).map((c) => c.id));
      const at = nowIso();
      const ops = DEFAULT_CATEGORIES
        .filter(([key]) => !existing.has(`exp-cat-${key}`))
        .map(([key, name, icon, color], i) => ({
          store: 'expenseCategories', op: 'put',
          record: { id: `exp-cat-${key}`, name, description: '', icon, color, order: i + 1, hidden: false, createdAt: at, updatedAt: at }
        }));
      ops.push({ store: 'meta', op: 'put', record: { id: 'expenseCatsSeeded', value: true } });
      await db.batch(ops);
    })().finally(() => { seeding = null; });
  }
  return seeding;
}

export async function listExpenseCategories() {
  await ensureDefaultCategories();
  return (await db.getAll('expenseCategories')).sort((a, b) => a.order - b.order);
}

async function audit(action, entity, entityId, summary) {
  try { await db.put('audit', { id: uid(), at: nowIso(), action, entity, entityId, summary }); } catch (e) { console.warn('No se pudo registrar en el historial', e); }
}

export async function saveExpenseCategory(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Escribe el nombre de la categoría.');
  if (name.length > 40) throw new Error('El nombre es demasiado largo (máximo 40 caracteres).');
  const all = await listExpenseCategories();
  if (all.some((c) => c.id !== input.id && c.name.toLowerCase() === name.toLowerCase())) throw new Error('Ya existe una categoría de gastos con ese nombre.');
  const existing = input.id ? all.find((c) => c.id === input.id) : null;
  if (input.id && !existing) throw new Error('La categoría ya no existe.');
  const rec = {
    id: existing?.id || uid(), name,
    description: String(input.description || '').trim().slice(0, 120),
    color: input.color || '#475569', icon: input.icon || '📌',
    order: existing ? existing.order : all.reduce((m, c) => Math.max(m, c.order), 0) + 1,
    hidden: existing ? existing.hidden : false,
    createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(),
    ...(existing?.demo ? { demo: true } : {})
  };
  await db.put('expenseCategories', rec);
  await audit(existing ? 'editar' : 'crear', 'categoría de gasto', rec.id, rec.name);
  // Si cambió el nombre, los gastos viejos conservan el que tenían al registrarse (así el historial no se reescribe).
  return rec;
}

export async function moveExpenseCategory(id, direction) {
  const all = await listExpenseCategories();
  const i = all.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  all.forEach((c, k) => { c.order = k + 1; });
  await db.putMany('expenseCategories', all);
}

export async function setExpenseCategoryHidden(id, hidden) {
  const cat = await db.get('expenseCategories', id);
  if (!cat) throw new Error('La categoría ya no existe.');
  await db.put('expenseCategories', { ...cat, hidden: !!hidden, updatedAt: nowIso() });
  await audit(hidden ? 'ocultar' : 'mostrar', 'categoría de gasto', id, cat.name);
}

export async function deleteExpenseCategory(id) {
  const n = (await db.getAll('expenses')).filter((e) => e.categoryId === id).length;
  if (n) throw new Error(`Esta categoría tiene ${n} gasto(s) registrado(s). Ocúltala en lugar de eliminarla para conservar tu historial.`);
  const cat = await db.get('expenseCategories', id);
  await db.remove('expenseCategories', id);
  await audit('eliminar', 'categoría de gasto', id, cat?.name || '');
}

/* ============ Gastos ============ */

const byDateDesc = (a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1));
export async function listExpenses() {
  return (await db.getAll('expenses')).sort(byDateDesc);
}

export const methodsOf = (config) => ['Efectivo', ...config.sales.otherMethods.filter((m) => m.toLowerCase() !== 'efectivo')];
export const todayKey = (config) => dateKey(nowIso(), config.timezone);

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

// Valida y normaliza los datos del formulario. Lanza un Error con un mensaje claro en español.
async function clean(input, config, existing) {
  const date = String(input.date || '').trim();
  if (!validDate(date)) throw new Error('Elige una fecha válida.');
  if (date < '2000-01-01') throw new Error('La fecha es demasiado antigua. Revísala.');
  if (!config.expenses.allowFutureDates && date > todayKey(config)) throw new Error('La fecha no puede ser posterior a hoy (se puede permitir en Configuración → Gastos).');

  const concept = String(input.concept || '').trim();
  if (!concept) throw new Error('Escribe el concepto del gasto (por ejemplo, “Renta de noviembre”).');
  if (concept.length > 80) throw new Error('El concepto es demasiado largo (máximo 80 caracteres).');

  const raw = input.amount === '' || input.amount == null ? NaN : Number(input.amount);
  if (!Number.isFinite(raw) || raw <= 0) throw new Error('Escribe un monto mayor a 0.');
  const amount = round2(raw);
  if (amount <= 0) throw new Error('El monto es demasiado pequeño.');
  if (amount > MAX_AMOUNT) throw new Error('El monto es demasiado grande. Revísalo.');

  const cats = await listExpenseCategories();
  const cat = cats.find((c) => c.id === input.categoryId);
  if (!cat) throw new Error('Elige una categoría de gasto.');
  if (cat.hidden && existing?.categoryId !== cat.id) throw new Error(`La categoría “${cat.name}” está oculta. Elige otra o muéstrala en la pestaña Categorías.`);

  const method = String(input.method || '').trim();
  if (!method) throw new Error('Elige cómo se pagó el gasto.');
  if (!methodsOf(config).includes(method) && existing?.method !== method) throw new Error(`“${method}” ya no es un método de pago válido. Elige otro.`);

  const supplier = String(input.supplier || '').trim();
  if (supplier.length > 60) throw new Error('El proveedor es demasiado largo (máximo 60 caracteres).');
  const notes = String(input.notes || '').trim();
  if (notes.length > 300) throw new Error('Las notas son demasiado largas (máximo 300 caracteres).');

  return { date, concept, amount, categoryId: cat.id, categoryName: cat.name, categoryIcon: cat.icon, method, supplier, notes };
}

// input: { id?, date, concept, amount, categoryId, method, supplier, notes }
export async function createExpense(input, config) {
  if (input.id) { // evita duplicar el gasto si se pulsa dos veces
    const again = await db.get('expenses', input.id);
    if (again) return again;
  }
  const fields = await clean(input, config, null);
  // Solo ahora se reserva el folio, así un gasto inválido no gasta números.
  const counter = await db.update('meta', 'expenseCounter', (cur) => ({ id: 'expenseCounter', value: (cur?.value || 0) + 1 }));
  const createdAt = nowIso();
  const id = input.id || uid();
  const expense = {
    id, number: counter.value,
    folio: formatFolio(config.expenses.folioFormat, counter.value, new Date(createdAt), config.timezone),
    ...fields, status: 'active', cancelled: null, createdAt, updatedAt: createdAt
  };
  await db.batch([
    { store: 'expenses', op: 'put', record: expense },
    { store: 'audit', op: 'put', record: { id: uid(), at: createdAt, action: 'crear', entity: 'gasto', entityId: id, summary: `${expense.folio} · ${expense.concept} · ${expense.amount}` } }
  ]);
  return expense;
}

export async function updateExpense(id, input, config) {
  const existing = await db.get('expenses', id);
  if (!existing) throw new Error('El gasto ya no existe.');
  if (existing.status === 'cancelled') throw new Error('Un gasto cancelado ya no se puede editar.');
  const fields = await clean(input, config, existing);
  const updatedAt = nowIso();
  const expense = { ...existing, ...fields, updatedAt };
  await db.batch([
    { store: 'expenses', op: 'put', record: expense },
    { store: 'audit', op: 'put', record: { id: uid(), at: updatedAt, action: 'editar', entity: 'gasto', entityId: id, summary: `${existing.folio} · ${existing.amount} → ${expense.amount}` } }
  ]);
  return expense;
}

// rules: { enabled, maxDays } (de Configuración → Gastos). Un gasto cancelado deja de sumar, pero se conserva con su motivo.
export async function cancelExpense(id, reason, rules = {}) {
  const text = String(reason || '').trim();
  if (text.length < 3) throw new Error('Escribe el motivo de la cancelación (mínimo 3 caracteres).');
  const e = await db.get('expenses', id);
  if (!e) throw new Error('El gasto ya no existe.');
  if (e.status === 'cancelled') throw new Error('Este gasto ya estaba cancelado.');
  if (rules.enabled === false) throw new Error('La cancelación de gastos está desactivada en Configuración.');
  if (rules.maxDays > 0 && Date.now() - Date.parse(e.createdAt) > rules.maxDays * 86400000) {
    throw new Error(`Este gasto se registró hace más de ${rules.maxDays} día(s); ya no se puede cancelar (límite en Configuración).`);
  }
  const at = nowIso();
  await db.batch([
    { store: 'expenses', op: 'put', record: { ...e, status: 'cancelled', cancelled: { at, reason: text }, updatedAt: at } },
    { store: 'audit', op: 'put', record: { id: uid(), at, action: 'cancelar', entity: 'gasto', entityId: id, summary: `${e.folio} · ${text}` } }
  ]);
}
