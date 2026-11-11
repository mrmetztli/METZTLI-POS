// state.js — configuración de la app en memoria + guardado + tema visual.
// Fuente única de la configuración: los módulos la leen con getConfig()
// y la cambian con updateConfig().
import * as db from './database.js';

export const DEFAULT_CONFIG = {
  business: { name: 'Mi negocio', address: '', phone: '', contact: '', logo: '' }, // logo: imagen reducida (texto) o ''
  currency: 'MXN',
  timezone: 'America/Mexico_City',
  // cards: 'soft' (con sombra) · 'outlined' (solo borde) · 'flat' (sin borde) · nav: 'auto' (lateral en escritorio, inferior en teléfono) · 'side' · 'bottom'
  appearance: { accent: '#A855F7', accent2: '#22D3EE', mode: 'light', textSize: 'normal', density: 'comfortable', cards: 'soft', nav: 'auto' },
  // Catálogo: todo lo que se personaliza desde Catálogo → Personalizar
  catalog: {
    view: 'cards',                 // 'cards' o 'list'
    cardSize: 'medium',            // 'small', 'medium' o 'large'
    fields: { image: true, price: true, category: true, stock: true, sku: false, description: false, badges: true }, // campos de las tarjetas
    listColumns: { category: true, sku: true, price: true, cost: false, stock: true },                              // columnas de la lista
    sort: 'name',                  // ver SORTS en catalog-store.js
    perPage: 24,                   // 0 = todos
    featuredFirst: true,           // los destacados (★) salen primero
    placeholder: 'letter',         // sin imagen: 'letter' (inicial) o 'icon' (icono de la categoría)
    quickOrder: []                 // orden de los botones de venta rápida (ids de producto)
  },
  // Dashboard: "widgets" = orden y visibilidad de cada bloque; size solo aplica a bloques grandes
  dashboard: {
    period: 'month', chartType: 'bars',
    widgets: [
      { id: 'shortcuts', enabled: true, size: 'full' },
      { id: 'lowStock', enabled: true, size: 'full' },
      { id: 'todaySales', enabled: true }, { id: 'monthSales', enabled: true },
      { id: 'periodOps', enabled: true }, { id: 'periodAvg', enabled: true },
      { id: 'periodExpenses', enabled: true }, { id: 'periodResult', enabled: true },
      { id: 'periodDiscounts', enabled: false }, { id: 'periodCancelled', enabled: false }, { id: 'periodUnits', enabled: false },
      { id: 'chart', enabled: true, size: 'full' },
      { id: 'topProducts', enabled: true, size: 'half' }, { id: 'categories', enabled: true, size: 'half' },
      { id: 'expensesByCategory', enabled: true, size: 'half' },
      { id: 'recent', enabled: true, size: 'full' },
      { id: 'recentExpenses', enabled: false, size: 'full' }
    ]
  },
  // Reportes: columnas visibles por vista (null = todas, en el orden por defecto)
  reports: {
    defaultPreset: 'month',
    columns: { period: null, product: null, category: null, method: null, detail: null, expenseCategory: null, expenseDetail: null },
    summaryCards: null,
    chart: { period: 'bars', product: 'rank', category: 'rank', method: 'rank', expenseCategory: 'rank' },
    views: []                      // vistas guardadas por el usuario
  },
  sales: {
    otherMethods: ['Transferencia', 'Tarjeta'], // además de Efectivo, que siempre existe
    folioFormat: 'V-{####}',                    // {####}=consecutivo · {YYYY} {YY} {MM} {DD}=fecha
    discountsEnabled: true,
    priceEdit: 'allow',                         // 'allow' o 'deny': cambiar precio al vender
    ticketWidth: '80mm',                        // '58mm', '80mm' o 'carta'
    ticketFooter: '¡Gracias por su compra!',
    ticketLogo: false,                          // imprimir el logotipo en el ticket
    tax: { enabled: false, rate: 16, label: 'IVA' }, // IVA INCLUIDO en los precios: solo se desglosa en el ticket
    confirmBeforeSave: false,                   // pedir confirmación extra antes de guardar cada venta
    cancelEnabled: true,                        // permitir cancelar ventas
    cancelDays: 0                               // 0 = sin límite; si no, días máximos desde la venta
  },
  // Gastos: se editan en Configuración → Gastos. Los métodos de pago son los mismos de Ventas.
  expenses: {
    folioFormat: 'G-{####}',        // mismos tokens que el folio de ventas
    defaultMethod: 'Efectivo',      // método que aparece preseleccionado al registrar un gasto
    allowFutureDates: false,        // permitir fechas posteriores a hoy
    cancelEnabled: true,            // permitir cancelar gastos (con motivo)
    cancelDays: 0                   // 0 = sin límite; si no, días máximos desde que se registró
  },
  units: ['pieza', 'kg', 'litro', 'servicio', 'hora'],
  // Orden y visibilidad de los módulos del menú. "icon" corresponde a components.js
  modules: [
    { id: 'dashboard', label: 'Inicio', icon: 'chart', enabled: true },
    { id: 'sales', label: 'Ventas', icon: 'cart', enabled: true },
    { id: 'reports', label: 'Reportes', icon: 'chart', enabled: true },
    { id: 'settings', label: 'Configuración', icon: 'gear', enabled: true }
  ]
};

let config = null;
const listeners = new Set();

function mergeModules(defaults, stored) {
  const out = [];
  for (const s of stored) {
    const d = defaults.find((x) => x.id === s.id);
    if (d) out.push({ ...d, ...s });
  }
  // Una opción nueva (por ejemplo, el módulo Gastos tras actualizar) entra justo después de la que la precede
  // en la lista por defecto, en vez de quedar al final del menú o del dashboard.
  defaults.forEach((d, i) => {
    if (out.some((x) => x.id === d.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((x) => x.id === defaults[j].id);
      if (k >= 0) { at = k + 1; break; }
    }
    out.splice(at, 0, { ...d });
  });
  return out;
}

// Mezcla lo guardado sobre los valores por defecto: si en el futuro agregas
// opciones nuevas, los datos viejos siguen funcionando.
function merge(base, extra) {
  for (const key of Object.keys(extra || {})) {
    if (key === 'id') continue;
    const value = extra[key];
    if ((key === 'modules' || key === 'widgets') && Array.isArray(value)) {
      base[key] = mergeModules(base[key], value); // listas con id: se conservan las nuevas opciones por defecto
    } else if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      merge(base[key], value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

function readableInk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#111111' : '#ffffff';
}

function applyTheme(c) {
  const root = document.documentElement;
  const a = c.appearance;
  const accent = /^#[0-9a-f]{6}$/i.test(a.accent) ? a.accent : DEFAULT_CONFIG.appearance.accent;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-ink', readableInk(accent));
  root.style.setProperty('--fs', { small: '15px', normal: '16px', large: '18px' }[a.textSize] || '16px');
  root.dataset.theme = a.mode === 'dark' ? 'dark' : 'light';
  root.dataset.density = a.density === 'compact' ? 'compact' : 'comfortable';
  const accent2 = /^#[0-9a-f]{6}$/i.test(a.accent2) ? a.accent2 : DEFAULT_CONFIG.appearance.accent2;
  root.style.setProperty('--accent-2', accent2);
  root.dataset.cards = ['soft', 'outlined', 'flat'].includes(a.cards) ? a.cards : 'soft';
  root.dataset.nav = ['auto', 'side', 'bottom'].includes(a.nav) ? a.nav : 'auto';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', accent);
  document.title = c.business.name ? `${c.business.name} · Caja` : 'Caja';
}

// Mezcla una configuración guardada con los valores por defecto (también se usa en las pruebas).
export const mergeConfig = (stored) => merge(structuredClone(DEFAULT_CONFIG), stored || {});

const notify = () => listeners.forEach((fn) => fn(config));

export async function init() {
  const stored = await db.get('settings', 'config');
  config = mergeConfig(stored);
  config.modules.forEach((m) => { m.enabled = true; }); // las 4 áreas principales siempre están visibles
  // Si una copia importada trae una moneda o zona horaria inválida, se vuelve al valor por defecto en vez de romper la app.
  try { new Intl.DateTimeFormat('es-MX', { timeZone: config.timezone }); } catch { config.timezone = DEFAULT_CONFIG.timezone; }
  try { new Intl.NumberFormat('es-MX', { style: 'currency', currency: config.currency }); } catch { config.currency = DEFAULT_CONFIG.currency; }
  applyTheme(config);
  if (!stored) await db.put('settings', { id: 'config', ...config });
}

export const getConfig = () => config;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Uso: await updateConfig((c) => { c.business.name = 'Cafetería Sol'; });
// Se ve de inmediato; si el guardado falla, se revierte y lanza el error.
export function updateConfig(mutator) {
  const previous = config;
  const next = structuredClone(config);
  mutator(next);
  next.modules.forEach((m) => { m.enabled = true; });
  config = next;
  applyTheme(next);
  notify();
  return db.put('settings', { id: 'config', ...next }).catch((err) => {
    config = previous;
    applyTheme(previous);
    notify();
    throw err;
  });
}
