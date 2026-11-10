// settings-sales.js — métodos de pago, folio, descuentos, precios, impuestos, cancelaciones, ticket y unidades.
import { getConfig } from './state.js';
import { escapeHtml } from './utilities.js';
import { formatFolio } from './sales-store.js';
import { options, bindField, bindSelect } from './settings-common.js';

const yesNo = (v) => (v ? '1' : '0');

export function render(host) {
  const s = getConfig().sales;
  host.innerHTML = `
    <section class="section"><h2>Cobro</h2>
      <div class="card form-grid">
        <div class="field"><label for="s-methods">Otros métodos de pago</label><input id="s-methods" class="input" value="${escapeHtml(s.otherMethods.join(', '))}">
          <span class="hint">Separados por comas. “Efectivo” siempre existe y es el único que da cambio.</span></div>
        <div class="field"><label for="s-folio">Formato del folio</label><input id="s-folio" class="input" maxlength="40" value="${escapeHtml(s.folioFormat)}">
          <span class="hint">Ejemplo: <b id="s-folio-prev"></b>. Usa {####} para el consecutivo y {YYYY} {MM} {DD} para la fecha.</span></div>
        <div class="field"><label for="s-confirm">Confirmar antes de guardar cada venta</label><select id="s-confirm" class="input">${options([['0', 'No (la pantalla de cobro ya confirma)'], ['1', 'Sí, pedir una confirmación extra']], yesNo(s.confirmBeforeSave))}</select></div>
      </div></section>
    <section class="section"><h2>Descuentos y precios</h2>
      <div class="card form-grid">
        <div class="field"><label for="s-disc">Descuentos</label><select id="s-disc" class="input">${options([['1', 'Permitidos'], ['0', 'Desactivados']], yesNo(s.discountsEnabled))}</select></div>
        <div class="field"><label for="s-price">Cambiar precio al vender</label><select id="s-price" class="input">${options([['allow', 'Permitido'], ['deny', 'No permitido']], s.priceEdit)}</select></div>
      </div></section>
    <section class="section"><h2>Impuestos</h2>
      <p class="muted small">Tus precios ya incluyen el impuesto. Si lo activas, el ticket muestra cuánto de cada venta corresponde a él. No cambia los totales.</p>
      <div class="card form-grid">
        <div class="field"><label for="s-tax">Desglosar impuesto en el ticket</label><select id="s-tax" class="input">${options([['0', 'No'], ['1', 'Sí']], yesNo(s.tax.enabled))}</select></div>
        <div class="field"><label for="s-taxrate">Tasa (%)</label><input id="s-taxrate" class="input" type="number" inputmode="decimal" min="0.01" max="100" step="0.01" value="${s.tax.rate}"></div>
        <div class="field"><label for="s-taxlabel">Nombre del impuesto</label><input id="s-taxlabel" class="input" maxlength="20" value="${escapeHtml(s.tax.label)}"></div>
      </div></section>
    <section class="section"><h2>Cancelaciones</h2>
      <div class="card form-grid">
        <div class="field"><label for="s-cancel">Cancelar ventas</label><select id="s-cancel" class="input">${options([['1', 'Permitido (con motivo obligatorio)'], ['0', 'No permitido']], yesNo(s.cancelEnabled))}</select></div>
        <div class="field"><label for="s-days">Límite de días para cancelar</label><input id="s-days" class="input" type="number" inputmode="numeric" min="0" max="3650" step="1" value="${s.cancelDays}">
          <span class="hint">0 = sin límite. Toda cancelación queda registrada en el historial.</span></div>
      </div></section>
    <section class="section"><h2>Ticket</h2>
      <div class="card form-grid">
        <div class="field"><label for="s-twidth">Tamaño del ticket</label><select id="s-twidth" class="input">${options([['58mm', 'Térmico 58 mm'], ['80mm', 'Térmico 80 mm'], ['carta', 'Hoja carta']], s.ticketWidth)}</select></div>
        <div class="field"><label for="s-tfooter">Mensaje al pie del ticket</label><input id="s-tfooter" class="input" maxlength="100" value="${escapeHtml(s.ticketFooter)}"></div>
        <div class="field"><label for="s-tlogo">Logotipo en el ticket</label><select id="s-tlogo" class="input">${options([['0', 'No'], ['1', 'Sí (si hay logotipo en Negocio)']], yesNo(s.ticketLogo))}</select></div>
      </div></section>
    <section class="section"><h2>Catálogo</h2>
      <div class="card form-grid">
        <div class="field"><label for="s-units">Unidades de medida</label><input id="s-units" class="input" value="${escapeHtml(getConfig().units.join(', '))}">
          <span class="hint">Sepáralas con comas. Quitar una unidad no cambia los productos que ya la usan.</span></div>
      </div></section>`;

  const split = (text) => [...new Set(text.split(',').map((x) => x.trim()).filter(Boolean))];
  bindField(host, '#s-methods', {
    read: () => getConfig().sales.otherMethods.join(', '),
    apply: (cfg, v) => { cfg.sales.otherMethods = split(v).filter((m) => m.toLowerCase() !== 'efectivo'); }
  });
  const folio = bindField(host, '#s-folio', {
    read: () => getConfig().sales.folioFormat,
    apply: (cfg, v) => { cfg.sales.folioFormat = v || 'V-{####}'; }
  });
  const showFolio = () => { host.querySelector('#s-folio-prev').textContent = formatFolio(folio.value.trim() || 'V-{####}', 1, new Date(), getConfig().timezone); };
  folio.addEventListener('input', showFolio);
  showFolio();
  bindSelect(host, '#s-confirm', (cfg, v) => { cfg.sales.confirmBeforeSave = v === '1'; });
  bindSelect(host, '#s-disc', (cfg, v) => { cfg.sales.discountsEnabled = v === '1'; });
  bindSelect(host, '#s-price', (cfg, v) => { cfg.sales.priceEdit = v; });
  bindSelect(host, '#s-tax', (cfg, v) => { cfg.sales.tax.enabled = v === '1'; });
  bindField(host, '#s-taxrate', {
    read: () => String(getConfig().sales.tax.rate),
    validate: (v) => (Number(v) > 0 && Number(v) <= 100 ? '' : 'La tasa debe ser mayor a 0 y máximo 100.'),
    apply: (cfg, v) => { cfg.sales.tax.rate = Number(v); }
  });
  bindField(host, '#s-taxlabel', {
    read: () => getConfig().sales.tax.label,
    validate: (v) => (v ? '' : 'Escribe el nombre del impuesto (por ejemplo, IVA).'),
    apply: (cfg, v) => { cfg.sales.tax.label = v; }
  });
  bindSelect(host, '#s-cancel', (cfg, v) => { cfg.sales.cancelEnabled = v === '1'; });
  bindField(host, '#s-days', {
    read: () => String(getConfig().sales.cancelDays),
    validate: (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 3650 ? '' : 'Escribe un número entero de días (0 = sin límite).'),
    apply: (cfg, v) => { cfg.sales.cancelDays = Number(v); }
  });
  bindSelect(host, '#s-twidth', (cfg, v) => { cfg.sales.ticketWidth = v; });
  bindField(host, '#s-tfooter', { read: () => getConfig().sales.ticketFooter, apply: (cfg, v) => { cfg.sales.ticketFooter = v; } });
  bindSelect(host, '#s-tlogo', (cfg, v) => { cfg.sales.ticketLogo = v === '1'; });
  bindField(host, '#s-units', {
    read: () => getConfig().units.join(', '),
    validate: (v) => (split(v).length ? '' : 'Escribe al menos una unidad.'),
    apply: (cfg, v) => { cfg.units = split(v); }
  });
}
