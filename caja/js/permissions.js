// permissions.js — permisos de acceso para propietarios y cajeros.
import * as cloud from './supabase.js';

export const PERMISSION_DEFS = {
  catalog_view: { label: 'Consultar catálogo', risk: 'Permite abrir el catálogo y consultar productos y existencias.' },
  products_create: { label: 'Agregar productos', risk: 'Permite crear productos y servicios nuevos en el inventario.' },
  products_edit: { label: 'Editar productos', risk: 'Permite modificar nombres, categorías, descripciones e imágenes.' },
  prices_edit: { label: 'Modificar precios', risk: 'Puede cambiar el precio de venta y afectar directamente los ingresos.' },
  stock_adjust: { label: 'Ajustar existencias', risk: 'Puede aumentar o reducir inventario sin que exista una venta.' },
  discounts: { label: 'Aplicar descuentos', risk: 'Reduce el importe que paga el cliente y puede disminuir el margen.' },
  cancel_sales: { label: 'Cancelar ventas', risk: 'Revierte una venta y devuelve existencias al inventario.' },
  clients_manage: { label: 'Gestionar clientes', risk: 'Permite consultar, crear y modificar datos de clientes.' }
};

const OWNER_PERMISSIONS = Object.keys(PERMISSION_DEFS).reduce((out, key) => ({ ...out, [key]: true }), {});
let cached = null;
let cachedAt = 0;

export function invalidatePermissionContext() {
  cached = null;
  cachedAt = 0;
}

export async function getPermissionContext(force = false) {
  if (!force && cached && Date.now() - cachedAt < 15000) return cached;

  let session = null;
  try { session = await cloud.getSession(); } catch {}
  if (!session) {
    cached = { role: 'owner', permissions: OWNER_PERMISSIONS, local: true, membership: null };
    cachedAt = Date.now();
    return cached;
  }

  try {
    const membership = await cloud.getMyMembership();
    if (!membership) {
      cached = { role: 'owner', permissions: OWNER_PERMISSIONS, local: true, membership: null };
    } else if (membership.role === 'owner') {
      cached = { role: 'owner', permissions: OWNER_PERMISSIONS, local: false, membership };
    } else if (membership.role === 'cashier') {
      const permissions = Object.fromEntries(Object.keys(PERMISSION_DEFS).map((key) => [key, membership.permissions?.[key] === true]));
      cached = { role: 'cashier', permissions, local: false, membership };
    } else {
      cached = { role: 'unknown', permissions: {}, local: false, membership };
    }
  } catch (error) {
    cached = { role: 'unknown', permissions: {}, local: false, membership: null, error };
  }
  cachedAt = Date.now();
  return cached;
}

export async function getCurrentRole() {
  return (await getPermissionContext()).role;
}

export async function hasPermission(permission) {
  const context = await getPermissionContext();
  return context.role === 'owner' || (context.role === 'cashier' && context.permissions[permission] === true);
}

export async function requirePermission(permission) {
  if (await hasPermission(permission)) return true;
  const definition = PERMISSION_DEFS[permission];
  throw new Error(definition
    ? `Tu cuenta no tiene permiso para: ${definition.label.toLowerCase()}.`
    : 'Tu cuenta no tiene autorización para realizar esta acción.');
}

export async function requireOwner() {
  const context = await getPermissionContext();
  if (context.role !== 'owner') throw new Error('Esta función es exclusiva del propietario.');
  return true;
}
