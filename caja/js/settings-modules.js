// settings-modules.js — habilitar, ocultar y reordenar los módulos del menú.
import { getConfig } from './state.js';
import { mountOrderEditor } from './components.js';
import { save } from './settings-common.js';

export function render(host) {
  host.innerHTML = `<section class="section"><h2>Módulos del menú</h2>
    <p class="muted small">Marca los que quieres ver y ordénalos con ↑ ↓. Ocultar un módulo no borra sus datos. Configuración siempre está disponible. Cada módulo tiene su propio botón “Personalizar”.</p>
    <div id="m-list"></div></section>`;
  mountOrderEditor(host.querySelector('#m-list'), {
    items: getConfig().modules.map((m) => ({ id: m.id, label: m.label, enabled: m.enabled, locked: m.id === 'settings' })),
    onChange: (list) => save((cfg) => {
      cfg.modules = list.map(({ id, enabled }) => ({ ...cfg.modules.find((m) => m.id === id), enabled: id === 'settings' ? true : enabled }));
    })
  });
}
