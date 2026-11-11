// router.js — navegación por "#/ruta". Cuatro áreas principales; cada una carga su módulo solo cuando se necesita.
// Rutas: #/inicio · #/ventas · #/reportes · #/configuracion  (Catálogo, Gastos y Clientes viven dentro de Configuración).
import { getConfig, subscribe } from './state.js';
import { icon } from './components.js';
import { escapeHtml } from './utilities.js';

// Para agregar un módulo nuevo: crea su archivo y regístralo aquí y en state.js (DEFAULT_CONFIG.modules).
const LOADERS = {
  dashboard: () => import('./dashboard.js'),
  sales: () => import('./sales.js'),
  reports: () => import('./reports.js'),
  settings: () => import('./settings.js')
};

const GROUPS = [
  { id: 'inicio', label: 'Inicio', icon: 'chart', modules: ['dashboard'] },
  { id: 'ventas', label: 'Ventas', icon: 'cart', modules: ['sales'] },
  { id: 'reportes', label: 'Reportes', icon: 'chart', modules: ['reports'] },
  { id: 'configuracion', label: 'Configuración', icon: 'gear', modules: ['settings'] }
];

// Rutas de versiones anteriores (marcadores guardados, enlaces viejos) → ruta nueva.
const ALIASES = {
  dashboard: 'inicio', sales: 'ventas', reports: 'reportes', settings: 'configuracion',
  catalog: 'configuracion?s=catalog', expenses: 'configuracion?s=expenses', clients: 'configuracion?s=clients'
};

let current = null;
let token = 0;

const wantedRoute = () => location.hash.replace(/^#\/?/, '');

function currentGroup() {
  const id = wantedRoute().split('?')[0];
  return GROUPS.find((g) => g.id === id) || GROUPS[0];
}

export function renderNav() {
  const active = currentGroup();
  const name = getConfig().business.name || 'Mi negocio';
  const links = GROUPS.map((g) => `
    <a class="nav-link ${g.id === active.id ? 'is-group-active' : ''}" href="#/${g.id}" ${g.id === active.id ? 'aria-current="page"' : ''}>
      ${icon(g.icon)}<span>${g.label}</span>
    </a>`).join('');
  const logo = getConfig().business.logo;
  const mark = logo ? `<img class="brand-logo" src="${escapeHtml(logo)}" alt="">`
    : `<span class="brand-mark">${escapeHtml(name.trim().charAt(0).toUpperCase() || 'C')}</span>`;
  document.getElementById('nav').innerHTML = `
    <div class="brand">${mark}<span class="brand-name">${escapeHtml(name)}</span></div>
    <div class="nav-primary">${links}</div>`;
}

async function show() {
  const route = wantedRoute();
  const alias = ALIASES[route.split('?')[0]];
  if (alias) { location.replace('#/' + alias); return; } // vuelve a llamar a show() por el cambio de hash
  const group = currentGroup();
  const view = document.getElementById('view');
  const mine = ++token;
  renderNav();
  if (current?.destroy) current.destroy();
  current = null;
  view.innerHTML = '';
  try {
    const mod = await LOADERS[group.modules[0]]();
    if (mine !== token) return; // el usuario ya navegó a otra sección
    current = mod;
    await mod.render(view);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><h2>No se pudo abrir esta sección</h2>
      <p class="muted">${escapeHtml(err.message)}</p></div>`;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', show);
  subscribe(renderNav); // el menú se actualiza si cambia el nombre o el logotipo
  show();
}
