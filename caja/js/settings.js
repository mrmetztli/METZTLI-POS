// settings.js — Configuración con lista lateral de subsecciones (en teléfono, barra horizontal).
//   Negocio → settings-business.js · Catálogo → catalog.js · Ventas → settings-sales.js
//   Gastos → expenses.js (registro) + settings-expenses.js (ajustes) · Personalización → settings-appearance.js
//   Datos y App → settings-data.js · Clientes → clients.js · Sobre nosotros → texto fijo
// Catálogo, Gastos y Clientes ya no son módulos del menú: se montan aquí, con su lógica intacta.
import { pageHeader } from './components.js';
import * as business from './settings-business.js';
import * as appearance from './settings-appearance.js';
import * as salesCfg from './settings-sales.js';
import * as expensesCfg from './settings-expenses.js';
import * as data from './settings-data.js';
import { escapeHtml } from './utilities.js';

const SECTIONS = [
  ['business', 'Negocio'], ['catalog', 'Catálogo'], ['sales', 'Ventas'], ['expenses', 'Gastos'], ['appearance', 'Personalización'],
  ['data', 'Datos'], ['app', 'App'], ['clients', 'Clientes'], ['about', 'Sobre nosotros']
];
const ui = { section: 'business', expensesTab: 'list' }; // se recuerdan mientras la app esté abierta
let mounted = null; // módulo montado ahora (para llamar a su destroy al salir)
let token = 0;

// Abre una subsección desde un enlace: href="#/configuracion?s=catalog"
const sectionFromHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('s');

function leave() {
  if (mounted?.destroy) mounted.destroy();
  mounted = null;
}

const mountModule = async (path, host) => {
  const mod = await import(path);
  await mod.render(host);
  return mod;
};

const BUILDERS = {
  business: async (host) => business.render(host),
  catalog: async (host) => { mounted = await mountModule('./catalog.js', host); },
  sales: async (host) => salesCfg.render(host),
  expenses: async (host) => {
    host.innerHTML = `<div class="chips" id="x-tabs" role="group" aria-label="Gastos">
        <button type="button" class="chip" data-x="list" aria-pressed="${ui.expensesTab === 'list'}">Registro</button>
        <button type="button" class="chip" data-x="cfg" aria-pressed="${ui.expensesTab === 'cfg'}">Ajustes de gastos</button></div>
      <div id="x-body"></div>`;
    host.querySelector('#x-tabs').addEventListener('click', (e) => {
      const k = e.target.closest('[data-x]')?.dataset.x;
      if (!k || k === ui.expensesTab) return;
      ui.expensesTab = k;
      leave();
      BUILDERS.expenses(host);
    });
    const body = host.querySelector('#x-body');
    if (ui.expensesTab === 'cfg') expensesCfg.render(body);
    else mounted = await mountModule('./expenses.js', body);
  },
  appearance: async (host) => appearance.render(host),
  data: async (host) => data.render(host, { part: 'backup' }),
  app: async (host) => data.render(host, { part: 'app' }),
  clients: async (host) => { mounted = await mountModule('./clients.js', host); },
  about: async (host) => {
    host.innerHTML = `<section class="section"><h2>Sobre nosotros</h2>
      <div class="card stack"><p>mrmetztli@gmail.com</p><p>7771913398</p></div></section>`;
  }
};

export function render(root) {
  const wanted = sectionFromHash();
  if (wanted && SECTIONS.some(([k]) => k === wanted)) ui.section = wanted;
  root.innerHTML = pageHeader('Configuración', 'Ajusta tu negocio, tu catálogo, tus clientes y tus datos') + `
    <div class="set-layout">
      <nav class="set-nav" id="set-nav" aria-label="Secciones de Configuración">
        ${SECTIONS.map(([k, l]) => `<button type="button" class="set-link" data-sec="${k}" aria-current="${k === ui.section ? 'page' : 'false'}">${l}</button>`).join('')}
      </nav>
      <div class="set-body" id="set-body"></div>
    </div>`;
  const body = root.querySelector('#set-body');
  const show = async () => {
    const mine = ++token;
    leave();
    root.querySelectorAll('#set-nav .set-link').forEach((b) => b.setAttribute('aria-current', b.dataset.sec === ui.section ? 'page' : 'false'));
    body.innerHTML = '';
    try {
      await BUILDERS[ui.section](body);
    } catch (err) {
      console.error(err);
      body.innerHTML = `<div class="card"><h2>No se pudo abrir esta sección</h2><p class="muted">${escapeHtml(err.message)}</p></div>`;
    }
    if (mine !== token) leave(); // el usuario cambió de sección mientras cargaba
  };
  root.querySelector('#set-nav').addEventListener('click', (e) => {
    const k = e.target.closest('[data-sec]')?.dataset.sec;
    if (!k || k === ui.section) return;
    ui.section = k;
    history.replaceState(null, '', `#/configuracion?s=${k}`); // recuerda la sección sin recargar la pantalla
    show();
  });
  return show();
}

export function destroy() {
  token++;
  leave();
}
