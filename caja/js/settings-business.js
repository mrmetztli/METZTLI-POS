// settings-business.js — datos del negocio, logotipo, moneda y zona horaria.
import { getConfig } from './state.js';
import { toast } from './components.js';
import { escapeHtml, resizeImage } from './utilities.js';
import { save, options, bindField, bindSelect } from './settings-common.js';

const CURRENCIES = [['MXN', 'Peso mexicano (MXN)'], ['USD', 'Dólar estadounidense (USD)'], ['EUR', 'Euro (EUR)']];
const TIMEZONES = [
  ['America/Mexico_City', 'Centro de México (CDMX, Guadalajara, Monterrey)'], ['America/Cancun', 'Quintana Roo (Cancún)'],
  ['America/Chihuahua', 'Chihuahua'], ['America/Hermosillo', 'Sonora (Hermosillo)'],
  ['America/Mazatlan', 'Pacífico (Mazatlán, Sinaloa, Baja California Sur)'], ['America/Tijuana', 'Noroeste (Tijuana)']
];
const withCurrent = (list, value) => (list.some(([v]) => v === value) ? list : [...list, [value, value]]);

export function render(host) {
  const c = getConfig();
  const b = c.business;
  host.innerHTML = `
    <section class="section"><h2>Datos del negocio</h2>
      <p class="muted small">Esta información aparece en el encabezado de tus tickets.</p>
      <div class="card form-grid">
        <div class="field"><label for="b-name">Nombre comercial</label><input id="b-name" class="input" maxlength="60" value="${escapeHtml(b.name)}"></div>
        <div class="field"><label for="b-phone">Teléfono (opcional)</label><input id="b-phone" class="input" inputmode="tel" maxlength="30" value="${escapeHtml(b.phone)}"></div>
        <div class="field"><label for="b-address">Dirección (opcional)</label><input id="b-address" class="input" maxlength="120" value="${escapeHtml(b.address)}"></div>
        <div class="field"><label for="b-contact">Otro contacto (opcional)</label><input id="b-contact" class="input" maxlength="80" placeholder="Correo, redes, sitio web…" value="${escapeHtml(b.contact)}"></div>
      </div></section>
    <section class="section"><h2>Logotipo</h2>
      <div class="card stack">
        <div class="row">
          <img class="logo-prev" id="b-logo-prev" alt="Logotipo del negocio" ${b.logo ? `src="${escapeHtml(b.logo)}"` : 'hidden'}>
          <input id="b-logo" type="file" accept="image/*" aria-label="Elegir logotipo">
          <button class="btn btn-sm" id="b-logo-remove" type="button" ${b.logo ? '' : 'hidden'}>Quitar logotipo</button>
        </div>
        <p class="hint">Se reduce automáticamente. Aparece en el menú y, si lo activas en Ventas, en el ticket.</p>
      </div></section>
    <section class="section"><h2>Moneda y zona horaria</h2>
      <div class="card form-grid">
        <div class="field"><label for="b-currency">Moneda</label><select id="b-currency" class="input">${options(withCurrent(CURRENCIES, c.currency), c.currency)}</select>
          <span class="hint">Solo cambia cómo se muestran los importes; no convierte las ventas ya registradas.</span></div>
        <div class="field"><label for="b-tz">Zona horaria</label><select id="b-tz" class="input">${options(withCurrent(TIMEZONES, c.timezone), c.timezone)}</select>
          <span class="hint">Define a qué día pertenece cada venta en el dashboard y los reportes.</span></div>
      </div></section>`;

  bindField(host, '#b-name', {
    read: () => getConfig().business.name,
    validate: (v) => (v ? '' : 'El nombre no puede quedar vacío'),
    apply: (cfg, v) => { cfg.business.name = v; }
  });
  for (const [id, key] of [['#b-phone', 'phone'], ['#b-address', 'address'], ['#b-contact', 'contact']]) {
    bindField(host, id, { read: () => getConfig().business[key], apply: (cfg, v) => { cfg.business[key] = v; } });
  }
  bindSelect(host, '#b-currency', (cfg, v) => { cfg.currency = v; });
  bindSelect(host, '#b-tz', (cfg, v) => { cfg.timezone = v; });

  host.querySelector('#b-logo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      let logo = await resizeImage(file, 256, { png: true });
      if (logo.length > 400000) logo = await resizeImage(file, 256); // PNG muy pesado: se guarda como JPG
      if (await save((cfg) => { cfg.business.logo = logo; }, 'Logotipo guardado')) {
        host.querySelector('#b-logo-prev').src = logo;
        host.querySelector('#b-logo-prev').hidden = false;
        host.querySelector('#b-logo-remove').hidden = false;
      }
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });
  host.querySelector('#b-logo-remove').addEventListener('click', async () => {
    if (await save((cfg) => { cfg.business.logo = ''; }, 'Logotipo quitado')) {
      host.querySelector('#b-logo-prev').hidden = true;
      host.querySelector('#b-logo-remove').hidden = true;
    }
  });
}
