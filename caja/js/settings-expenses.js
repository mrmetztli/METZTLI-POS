// settings-expenses.js — folio, método de pago predeterminado, fechas y cancelaciones de los gastos.
// Los métodos de pago son los de Ventas (Configuración → Ventas); las categorías se administran en Gastos → Categorías.
import { getConfig } from './state.js';
import { escapeHtml } from './utilities.js';
import { formatFolio } from './sales-store.js';
import { methodsOf } from './expenses-store.js';
import { options, bindField, bindSelect } from './settings-common.js';

const yesNo = (v) => (v ? '1' : '0');

export function render(host) {
  const x = getConfig().expenses;
  const methods = methodsOf(getConfig());
  host.innerHTML = `
    <section class="section"><h2>Registro de gastos</h2>
      <div class="card form-grid">
        <div class="field"><label for="x-folio">Formato del folio</label><input id="x-folio" class="input" maxlength="40" value="${escapeHtml(x.folioFormat)}">
          <span class="hint">Ejemplo: <b id="x-folio-prev"></b>. Usa {####} para el consecutivo y {YYYY} {MM} {DD} para la fecha.</span></div>
        <div class="field"><label for="x-method">Método de pago predeterminado</label><select id="x-method" class="input">${options(methods.map((m) => [m, m]), methods.includes(x.defaultMethod) ? x.defaultMethod : 'Efectivo')}</select>
          <span class="hint">Los métodos son los mismos de Ventas (Configuración → Ventas).</span></div>
        <div class="field"><label for="x-future">Fechas posteriores a hoy</label><select id="x-future" class="input">${options([['0', 'No permitidas'], ['1', 'Permitidas (gastos programados)']], yesNo(x.allowFutureDates))}</select></div>
      </div></section>
    <section class="section"><h2>Cancelaciones</h2>
      <div class="card form-grid">
        <div class="field"><label for="x-cancel">Cancelar gastos</label><select id="x-cancel" class="input">${options([['1', 'Permitido (con motivo obligatorio)'], ['0', 'No permitido']], yesNo(x.cancelEnabled))}</select></div>
        <div class="field"><label for="x-days">Límite de días para cancelar</label><input id="x-days" class="input" type="number" inputmode="numeric" min="0" max="3650" step="1" value="${x.cancelDays}">
          <span class="hint">0 = sin límite. Un gasto cancelado no suma en ningún reporte, pero queda registrado con su motivo.</span></div>
      </div></section>
    <p class="muted small">Las categorías de gasto se administran en Gastos → Categorías.</p>`;

  const folio = bindField(host, '#x-folio', {
    read: () => getConfig().expenses.folioFormat,
    apply: (cfg, v) => { cfg.expenses.folioFormat = v || 'G-{####}'; }
  });
  const showFolio = () => { host.querySelector('#x-folio-prev').textContent = formatFolio(folio.value.trim() || 'G-{####}', 1, new Date(), getConfig().timezone); };
  folio.addEventListener('input', showFolio);
  showFolio();
  bindSelect(host, '#x-method', (cfg, v) => { cfg.expenses.defaultMethod = v; });
  bindSelect(host, '#x-future', (cfg, v) => { cfg.expenses.allowFutureDates = v === '1'; });
  bindSelect(host, '#x-cancel', (cfg, v) => { cfg.expenses.cancelEnabled = v === '1'; });
  bindField(host, '#x-days', {
    read: () => String(getConfig().expenses.cancelDays),
    validate: (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 3650 ? '' : 'Escribe un número entero de días (0 = sin límite).'),
    apply: (cfg, v) => { cfg.expenses.cancelDays = Number(v); }
  });
}
