// settings.js — Configuración general, dividida en secciones. Cada sección vive en su propio archivo:
//   Negocio → settings-business.js · Apariencia → settings-appearance.js · Ventas → settings-sales.js · Gastos → settings-expenses.js
//   Módulos → settings-modules.js · Datos (respaldos y datos de prueba) → settings-data.js
import { pageHeader } from './components.js';
import * as business from './settings-business.js';
import * as appearance from './settings-appearance.js';
import * as sales from './settings-sales.js';
import * as expenses from './settings-expenses.js';
import * as modules from './settings-modules.js';
import * as data from './settings-data.js';

const SECTIONS = { business: ['Negocio', business], appearance: ['Apariencia', appearance], sales: ['Ventas', sales], expenses: ['Gastos', expenses], modules: ['Módulos', modules], data: ['Datos y respaldos', data] };
const ui = { section: 'business' }; // la sección abierta se recuerda mientras la app esté abierta

export function render(root) {
  root.innerHTML = pageHeader('Configuración', 'Ajusta tu negocio, la apariencia, las ventas y tus datos') + `
    <div class="chips" id="set-nav" role="group" aria-label="Secciones">
      ${Object.entries(SECTIONS).map(([k, [label]]) => `<button type="button" class="chip" data-sec="${k}" aria-pressed="${k === ui.section}">${label}</button>`).join('')}
    </div>
    <div id="set-body"></div>`;
  const show = () => {
    root.querySelectorAll('#set-nav .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sec === ui.section)));
    SECTIONS[ui.section][1].render(root.querySelector('#set-body'));
  };
  root.querySelector('#set-nav').addEventListener('click', (e) => {
    const k = e.target.closest('[data-sec]')?.dataset.sec;
    if (!k || k === ui.section) return;
    ui.section = k;
    show();
  });
  show();
}
