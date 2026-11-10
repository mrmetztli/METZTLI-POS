// router.js — navegación por "#/modulo". Carga cada módulo solo cuando se necesita.
import { getConfig, subscribe } from './state.js';
import { icon } from './components.js';
import { escapeHtml } from './utilities.js';

// Para agregar un módulo nuevo: crea su archivo y regístralo aquí y en state.js (DEFAULT_CONFIG.modules).
const LOADERS = {
  dashboard: () => import('./dashboard.js'),
  sales: () => import('./sales.js'),
  clients: () => import('./clients.js'),
  expenses: () => import('./expenses.js'),
  catalog: () => import('./catalog.js'),
  reports: () => import('./reports.js'),
  settings: () => import('./settings.js')
};

let current = null;
let token = 0;

const GROUPS = [
  { id: 'inicio', label: 'Inicio', icon: 'chart', modules: ['dashboard'] },
  { id: 'ventas', label: 'Ventas', icon: 'cart', modules: ['sales', 'clients'] },
  { id: 'productos', label: 'Productos', icon: 'tag', modules: ['catalog'] },
  { id: 'gestion', label: 'Gestión', icon: 'gear', modules: ['expenses', 'reports', 'settings'] }
];

const enabledModules = () => getConfig().modules.filter((m) => m.enabled && LOADERS[m.id]);

function currentId() {
  const wanted = location.hash.replace(/^#\/?/, '').split('?')[0];
  const mods = enabledModules();
  return (mods.find((m) => m.id === wanted) || mods[0])?.id;
}

function groupFor(moduleId, groups) {
  return groups.find((g) => g.items.some((m) => m.id === moduleId)) || groups[0];
}

export function renderNav() {
  const active = currentId();
  const name = getConfig().business.name || 'Mi negocio';
  const enabled = enabledModules();
  const groups = GROUPS.map((g) => ({ ...g, items: g.modules.map((id) => enabled.find((m) => m.id === id)).filter(Boolean) }))
    .filter((g) => g.items.length);
  const activeGroup = groupFor(active, groups);
  const links = groups.map((g) => `
    <a class="nav-link ${g.id === activeGroup?.id ? 'is-group-active' : ''}" href="#/${g.items[0].id}" ${g.id === activeGroup?.id ? 'aria-current="page"' : ''}>
      ${icon(g.icon)}<span>${g.label}</span>
    </a>`).join('');
  const sublinks = (activeGroup?.items || []).length > 1 ? `
    <div class="nav-submenu" aria-label="Secciones de ${activeGroup.label}">
      ${activeGroup.items.map((m) => `<a class="nav-sublink" href="#/${m.id}" ${m.id === active ? 'aria-current="page"' : ''}>${icon(m.icon)}<span>${escapeHtml(m.label)}</span></a>`).join('')}
    </div>` : '';
  const logo = getConfig().business.logo;
  const mark = logo ? `<img class="brand-logo" src="${escapeHtml(logo)}" alt="">`
    : `<span class="brand-mark">${escapeHtml(name.trim().charAt(0).toUpperCase() || 'C')}</span>`;
  document.getElementById('nav').innerHTML = `
    <div class="brand">${mark}<span class="brand-name">${escapeHtml(name)}</span></div>
    <div class="nav-primary">${links}</div>${sublinks}`;
}

async function show() {
  const id = currentId();
  const view = document.getElementById('view');
  const mine = ++token;
  renderNav();
  if (current?.destroy) current.destroy();
  current = null;
  view.innerHTML = '';
  try {
    const mod = await LOADERS[id]();
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
  subscribe(renderNav); // el menú se actualiza si cambia el nombre o los módulos
  show();
}
