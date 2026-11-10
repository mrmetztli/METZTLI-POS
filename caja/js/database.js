// database.js — ÚNICO archivo que habla con IndexedDB.
// Los demás módulos usan estas funciones; si algún día migras a Supabase,
// solo se reescribe este archivo.

const DB_NAME = 'caja-db';
// v3 (Clientes): agrega la tabla clients. Las bases anteriores se actualizan solas al abrir.
export const DB_VERSION = 3;

// Todas las "tablas" se crean desde el inicio para no tener que migrar después.
export const STORES = ['products', 'categories', 'sales', 'clients', 'expenses', 'expenseCategories', 'settings', 'audit', 'meta'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Este navegador no permite guardar datos locales (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('No se pudo abrir la base de datos.'));
    req.onblocked = () => reject(new Error('Cierra las otras pestañas de la app y recarga.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

// Ejecuta una operación en una transacción y espera a que termine de guardarse.
function run(storeName, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let out;
    try { out = fn(tx.objectStore(storeName)); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('La operación fue cancelada.'));
  }));
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const get = (store, id) => run(store, 'readonly', (s) => s.get(id));
export const count = (store) => run(store, 'readonly', (s) => s.count());
export const put = (store, record) => run(store, 'readwrite', (s) => s.put(record));
export const remove = (store, id) => run(store, 'readwrite', (s) => s.delete(id));
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());
export const putMany = (store, records) => run(store, 'readwrite', (s) => { records.forEach((r) => s.put(r)); });

// Copia de seguridad: todo el contenido en un objeto que se guarda como .json
export async function exportAll() {
  const data = {};
  for (const name of STORES) data[name] = await getAll(name);
  data.meta = data.meta.filter((r) => r.id !== 'preRestore'); // la copia previa a una restauración no viaja dentro de los respaldos
  return { app: 'caja', schema: DB_VERSION, exportedAt: new Date().toISOString(), data };
}

// Lee un registro, lo transforma y lo guarda en UNA sola transacción (por ejemplo, un contador de folios).
export function update(storeName, id, mutator) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const st = tx.objectStore(storeName);
    let result;
    const req = st.get(id);
    req.onsuccess = () => {
      try {
        result = mutator(req.result);
        st.put(result);
      } catch (e) {
        reject(e);
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('La operación fue cancelada.'));
  }));
}

// Varias escrituras en distintas tablas: o se guardan todas o no se guarda ninguna.
// ops: [{ store, op: 'put', record } | { store, op: 'delete', id }]
export function batch(ops) {
  const stores = [...new Set(ops.map((o) => o.store))];
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const o of ops) {
      const st = tx.objectStore(o.store);
      if (o.op === 'delete') st.delete(o.id); else st.put(o.record);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('La operación fue cancelada.'));
  }));
}

// Reemplaza TODO el contenido en una sola transacción (restaurar un respaldo):
// o se aplica completo o no cambia nada. data: { products: [...], sales: [...], ... }
export function replaceAll(data) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      const st = tx.objectStore(name);
      st.clear();
      for (const record of data[name] || []) st.put(record);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('La restauración fue cancelada; no se cambió nada.'));
  }));
}
