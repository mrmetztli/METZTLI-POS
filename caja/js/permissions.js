// permissions.js — permisos de acceso para propietarios y cajeros.
// Supabase se carga de forma diferida para que el modo local no dependa de Internet.
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

const STORAGE_KEY = 'metztli-caja-access-context';
const OWNER_PERMISSIONS = Object.keys(PERMISSION_DEFS).reduce((out, key) => ({ ...out, [key]: true }), {});
let cached = null;
let cachedAt = 0;
let cloudPromise = null;

async function getCloud() {
  if (!cloudPromise) cloudPromise = import('./supabase.js').catch(() => null);
  return cloudPromise;
}

function readStoredContext() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (value?.role === 'cashier' && value.permissions) {
      return { role: 'cashier', permissions: Object.fromEntries(Object.keys(PERMISSION_DEFS).map((key) => [key, value.permissions[key] === true])), local: false, membership: value.membership || null };
    }
  } catch {}
  return null;
}

function persistContext(context) {
  if (context.role !== 'cashier' && context.role !== 'owner') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      role: context.role,
      permissions: context.permissions,
      membership: context.membership ? { user_id: context.membership.user_id, business_id: context.membership.business_id } : null
    }));
  } catch {}
}

export function invalidatePermissionContext(clearStored = false) {
  cached = null;
  cachedAt = 0;
  if (clearStored) {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}

export async function getPermissionContext(force = false) {
  if (!force && cached && Date.now() - cachedAt < 15000) return cached;

  const cloud = await getCloud();
  if (!cloud) {
    cached = readStoredContext() || { role: 'owner', permissions: OWNER_PERMISSIONS, local: true, membership: null };
    cachedAt = Date.now();
    return cached;
  }

  let session = null;
  try { session = await cloud.getSession(); } catch {}
  if (!session) {
    invalidatePermissionContext(true);
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
    persistContext(cached);
  } catch (error) {
    cached = readStoredContext() || { role: 'unknown', permissions: {}, local: false, membership: null, error };
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

export async function getAuditActor() {
  const context = await getPermissionContext();
  return {
    actorRole: context.role,
    actorId: context.membership?.user_id || (context.local ? 'local-owner' : null)
  };
}
