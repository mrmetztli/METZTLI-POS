// backup.js — validar, restaurar y deshacer respaldos. Nunca se sobrescribe nada sin que el archivo
// pase la validación; antes de restaurar se guarda una copia automática para poder deshacer.
import * as db from './database.js';

export const MAX_BACKUP_BYTES = 80 * 1024 * 1024;

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

// Cada regla devuelve un texto de error o '' si el registro es válido.
const RULES = {
  products: (r) => (!isStr(r.name) ? 'sin nombre' : !isNum(r.price) || r.price < 0 ? 'precio inválido' : typeof r.active !== 'boolean' ? 'estado inválido' : ''),
  categories: (r) => (!isStr(r.name) ? 'sin nombre' : !isNum(r.order) ? 'orden inválido' : ''),
  sales: (r) => {
    if (!isStr(r.folio)) return 'sin folio';
    if (!isDate(r.createdAt)) return 'fecha inválida';
    if (!['completed', 'cancelled'].includes(r.status)) return 'estado inválido';
    if (!isNum(r.total) || !isNum(r.subtotal)) return 'totales inválidos';
    if (!Array.isArray(r.items) || !r.items.length) return 'sin artículos';
    if (!Array.isArray(r.payments)) return 'sin pagos';
    if (r.items.some((i) => !i || !isStr(i.productId) || !isStr(i.name) || !isNum(i.qty) || !(i.qty > 0) || !isNum(i.total))) return 'artículos inválidos';
    return '';
  },
  expenses: (r) => {
    if (!isStr(r.folio)) return 'sin folio';
    if (!isStr(r.concept)) return 'sin concepto';
    if (!isNum(r.amount) || !(r.amount > 0)) return 'monto inválido';
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) return 'fecha inválida';
    if (!['active', 'cancelled'].includes(r.status)) return 'estado inválido';
    return '';
  },
  expenseCategories: (r) => (!isStr(r.name) ? 'sin nombre' : !isNum(r.order) ? 'orden inválido' : ''),
  settings: (r) => (r.id !== 'config' ? 'configuración desconocida' : ''),
  audit: (r) => (!isDate(r.at) ? 'fecha inválida' : ''),
  meta: () => ''
};

const LABELS = { products: 'producto', categories: 'categoría', sales: 'venta', expenses: 'gasto', expenseCategories: 'categoría de gasto', settings: 'configuración', audit: 'historial', meta: 'dato interno' };

// Devuelve { ok, errors[], summary }. No modifica nada.
export function validateBackup(backup) {
  const errors = [];
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) return { ok: false, errors: ['El archivo no es un respaldo de Caja.'], summary: null };
  if (backup.app !== 'caja') errors.push('El archivo no es un respaldo de Caja.');
  if (!isNum(backup.schema)) errors.push('Falta la versión del respaldo.');
  else if (backup.schema > db.DB_VERSION) errors.push('El respaldo viene de una versión más nueva de la app. Actualiza la app antes de importarlo.');
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) errors.push('El respaldo no trae datos.');
  if (errors.length) return { ok: false, errors, summary: null };

  const counts = {};
  let known = 0;
  for (const store of db.STORES) {
    const list = backup.data[store];
    if (list === undefined) { counts[store] = 0; continue; }
    known += 1;
    if (!Array.isArray(list)) { errors.push(`La sección “${LABELS[store]}” está dañada.`); continue; }
    counts[store] = list.length;
    const seen = new Set();
    list.forEach((r, i) => {
      if (errors.length >= 8) return;
      if (!r || typeof r !== 'object' || !isStr(r.id)) { errors.push(`Un registro de ${LABELS[store]} (n.º ${i + 1}) no tiene identificador.`); return; }
      if (seen.has(r.id)) { errors.push(`Hay dos registros de ${LABELS[store]} con el mismo identificador.`); return; }
      seen.add(r.id);
      const problem = RULES[store](r);
      if (problem) errors.push(`Registro de ${LABELS[store]} n.º ${i + 1}: ${problem}.`);
    });
  }
  if (!known) errors.push('El respaldo no contiene ninguna sección conocida.');
  return { ok: !errors.length, errors, summary: errors.length ? null : { exportedAt: isDate(backup.exportedAt) ? backup.exportedAt : null, counts } };
}

// Lee el texto de un archivo y lo valida. Devuelve { ok, errors, backup?, summary? }.
export function parseBackup(text, size = text.length) {
  if (size > MAX_BACKUP_BYTES) return { ok: false, errors: ['El archivo es demasiado grande para ser un respaldo de Caja.'] };
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, errors: ['El archivo no es un respaldo válido (no se pudo leer).'] }; }
  const result = validateBackup(parsed);
  return result.ok ? { ...result, backup: parsed } : result;
}

// Reemplaza todos los datos por los del respaldo. Antes guarda una copia automática (para "Deshacer").
export async function restoreBackup(backup) {
  const check = validateBackup(backup);
  if (!check.ok) throw new Error(check.errors[0]);
  const snapshot = await db.exportAll();
  const data = { ...backup.data };
  data.meta = [...(data.meta || []).filter((r) => r.id !== 'preRestore'), { id: 'preRestore', at: new Date().toISOString(), value: snapshot }];
  await db.replaceAll(data);
}

export async function hasRestorePoint() {
  const rec = await db.get('meta', 'preRestore');
  return rec ? { at: rec.at } : null;
}

// Vuelve a los datos que había justo antes de la última restauración.
export async function undoRestore() {
  const rec = await db.get('meta', 'preRestore');
  if (!rec) throw new Error('No hay ninguna restauración que deshacer.');
  const check = validateBackup(rec.value);
  if (!check.ok) throw new Error('La copia automática está dañada: ' + check.errors[0]);
  await db.replaceAll(rec.value.data); // la copia previa no incluye "preRestore", así que deja de existir
}
