// tickets.js — arma el ticket (vista previa e impresión). Guardar como PDF se hace desde el diálogo de impresión.
import { escapeHtml, money, formatDateTime } from './utilities.js';

// Estilos del ticket; se usan en la vista previa y en la hoja que se imprime.
export const TICKET_CSS = `
.t{width:var(--tw,72mm);max-width:100%;margin:0 auto;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#000;background:#fff}
.t .c{text-align:center}.t .b{font-weight:700}.t .big{font-size:15px}.t .small{font-size:11px}
.t hr{border:0;border-top:1px dashed #000;margin:6px 0}
.t .ln{display:flex;justify-content:space-between;gap:8px}
.t .ln span:first-child{overflow-wrap:anywhere}
.t .sub{padding-left:8px;font-size:11px}
.t .total{font-size:15px;font-weight:700}
.t .stamp{border:2px solid #000;padding:2px;margin:4px 0;text-align:center;font-weight:700}`;

const WIDTHS = { '58mm': { w: '48mm', page: '58mm auto' }, '80mm': { w: '72mm', page: '80mm auto' }, carta: { w: '150mm', page: 'letter' } };

const qtyText = (q) => String(+Number(q).toFixed(3));

export function ticketBody(sale, config) {
  const b = config.business;
  const width = (WIDTHS[config.sales.ticketWidth] || WIDTHS['80mm']).w;
  const center = (text, cls = '') => (text ? `<div class="c ${cls}">${escapeHtml(text)}</div>` : '');
  const items = sale.items.map((i) => `
    <div class="ln"><span>${qtyText(i.qty)} × ${escapeHtml(i.name)}</span><span>${money(i.total)}</span></div>
    ${i.qty !== 1 || i.unitPrice !== i.listPrice ? `<div class="sub">${money(i.unitPrice)} c/u${i.unitPrice !== i.listPrice ? ` (precio normal ${money(i.listPrice)})` : ''}</div>` : ''}`).join('');
  const payments = sale.payments.map((p) => `<div class="ln"><span>${escapeHtml(p.method)}</span><span>${money(p.amount)}</span></div>`).join('');
  const logo = config.sales.ticketLogo && b.logo ? `<div class="c"><img src="${escapeHtml(b.logo)}" alt="" style="max-width:36mm;max-height:18mm"></div>` : '';
  return `<div class="t" style="--tw:${width}">
    ${logo}${center(b.name, 'b big')}${center(b.address, 'small')}${center(b.phone ? 'Tel. ' + b.phone : '', 'small')}${center(b.contact, 'small')}
    <hr>
    <div>Folio: <b>${escapeHtml(sale.folio)}</b></div>
    <div>Fecha: ${escapeHtml(formatDateTime(sale.createdAt))}</div>
    ${sale.customer ? `<div>Cliente: ${escapeHtml(sale.customer)}</div>` : ''}
    ${sale.status === 'cancelled' ? `<div class="stamp">VENTA CANCELADA</div>` : ''}
    <hr>${items}<hr>
    <div class="ln"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    ${sale.discount.amount > 0 ? `<div class="ln"><span>Descuento${sale.discount.type === 'percent' ? ` (${sale.discount.value}%)` : ''}</span><span>-${money(sale.discount.amount)}</span></div>` : ''}
    <div class="ln total"><span>TOTAL</span><span>${money(sale.total)}</span></div>
    ${sale.tax ? `<div class="ln small"><span>Incluye ${escapeHtml(sale.tax.label)} (${sale.tax.rate}%)</span><span>${money(sale.tax.amount)}</span></div>` : ''}
    ${payments ? `<hr>${payments}` : ''}
    ${sale.change > 0 ? `<div class="ln"><span>Cambio</span><span>${money(sale.change)}</span></div>` : ''}
    ${sale.notes ? `<hr><div class="small">Notas: ${escapeHtml(sale.notes)}</div>` : ''}
    ${config.sales.ticketFooter ? `<hr>${center(config.sales.ticketFooter, 'small')}` : ''}
  </div>`;
}

// Imprime en una hoja oculta. En el diálogo del navegador también puedes elegir "Guardar como PDF".
export function printTicket(sale, config) {
  const page = (WIDTHS[config.sales.ticketWidth] || WIDTHS['80mm']).page;
  const html = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><title>Ticket ${escapeHtml(sale.folio)}</title>
    <style>@page{size:${page};margin:3mm}html,body{margin:0;background:#fff}${TICKET_CSS}</style></head>
    <body>${ticketBody(sale, config)}</body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 2000);
  }, config.sales.ticketLogo && config.business.logo ? 400 : 150); // con logotipo se espera un poco más a que cargue la imagen
}
