// clients-store.js — clientes y agregados a partir de ventas.
import * as db from './database.js';
import { uid } from './utilities.js';

const nowIso = () => new Date().toISOString();
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export async function listClients() {
  const list = await db.getAll('clients');
  return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

export async function getClient(id) {
  return db.get('clients', id);
}

export async function saveClient(input) {
  const name = String(input.name || '').trim();
  if (name.length < 2) throw new Error('Escribe el nombre del cliente (mínimo 2 caracteres).');
  const phone = String(input.phone || '').trim();
  const notes = String(input.notes || '').trim();
  const existing = input.id ? await db.get('clients', input.id) : null;
  if (input.id && !existing) throw new Error('Ese cliente ya no existe.');
  const id = existing?.id || uid();
  const record = {
    id,
    name,
    phone,
    notes,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await db.put('clients', record);
  return record;
}

export async function deleteClient(id) {
  const c = await db.get('clients', id);
  if (!c) throw new Error('Ese cliente ya no existe.');
  await db.remove('clients', id);
  return true;
}

/** Ventas completadas que pertenecen al cliente (por id o por nombre). */
export function salesOfClient(client, allSales) {
  const nameKey = norm(client.name);
  const id = client.id;
  return allSales
    .filter((s) => s.status !== 'cancelled')
    .filter((s) => {
      if (id && s.customerId && s.customerId === id) return true;
      if (!s.customer) return false;
      return norm(s.customer) === nameKey;
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function statsOfClient(client, allSales) {
  const sales = salesOfClient(client, allSales);
  const totalPaid = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  return {
    salesCount: sales.length,
    totalPaid: Math.round(totalPaid * 100) / 100,
    sales
  };
}

/**
 * Lista unificada: clientes guardados + nombres que aparecen en ventas
 * y aún no tienen ficha (virtuales, id prefijo __fromsale__).
 */
export function buildClientDirectory(savedClients, allSales) {
  const byKey = new Map();
  for (const c of savedClients) {
    byKey.set(norm(c.name), { ...c, virtual: false });
  }
  for (const s of allSales) {
    if (s.status === 'cancelled') continue;
    const name = String(s.customer || '').trim();
    if (!name) continue;
    const key = norm(name);
    if (byKey.has(key)) continue;
    // Si la venta trae customerId y existe, ya está cubierto
    if (s.customerId && savedClients.some((c) => c.id === s.customerId)) continue;
    byKey.set(key, {
      id: `__fromsale__${key}`,
      name,
      phone: '',
      notes: '',
      virtual: true,
      createdAt: s.createdAt
    });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
