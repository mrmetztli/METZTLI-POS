// sales-history.js — historial de ventas: consulta, reimpresión y cancelación.
import * as store from './sales-store.js';
import { getConfig } from './state.js';
import { toast, openModal, promptDialog, emptyState } from './components.js';
import { escapeHtml, money, formatDateTime } from './utilities.js';
import { ticketBody, printTicket, TICKET_CSS } from './tickets.js';

const ui = { status: 'all', search: '', shown: 50, detailId: null };

export async function renderHistory(host) {
  let sales = await store.listSales();
  ui.detailId = null;

  const reload = async () => { sales = await store.listSales(); draw(); };

  function draw() {
    if (ui.detailId) return drawDetail();
    return drawList();
  }

  function visible() {
    const q = ui.search.trim().toLowerCase();
    return sales.filter((s) => {
      if (ui.status !== 'all' && s.status !== ui.status) return false;
      return !q || [s.folio, s.customer, ...s.items.map((i) => i.name)].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }

  function drawList() {
    if (!sales.length) {
      host.innerHTML = emptyState({ icon: 'list', title: 'Aún no hay ventas registradas', text: 'Cuando cobres tu primera venta aparecerá aquí, y podrás reimprimir su ticket o cancelarla.' });
      return;
    }
    host.innerHTML = `
      <div class="toolbar">
        <input class="input grow" id="h-q" type="search" placeholder="Buscar por folio, cliente o producto" aria-label="Buscar venta" value="${escapeHtml(ui.search)}">
        <select class="input" id="h-status" aria-label="Estado" style="width:auto">
          <option value="all" ${ui.status === 'all' ? 'selected' : ''}>Todas</option>
          <option value="completed" ${ui.status === 'completed' ? 'selected' : ''}>Completadas</option>
          <option value="cancelled" ${ui.status === 'cancelled' ? 'selected' : ''}>Canceladas</option>
        </select>
      </div>
      <div id="h-list" class="stack"></div>`;
    host.querySelector('#h-q').addEventListener('input', (e) => { ui.search = e.target.value; ui.shown = 50; drawRows(); });
    host.querySelector('#h-status').addEventListener('change', (e) => { ui.status = e.target.value; ui.shown = 50; drawRows(); });
    host.querySelector('#h-list').addEventListener('click', (e) => {
      if (e.target.closest('#h-more')) { ui.shown += 50; drawRows(); return; }
      const row = e.target.closest('[data-id]');
      if (row) { ui.detailId = row.dataset.id; draw(); window.scrollTo(0, 0); }
    });
    drawRows();
  }

  function drawRows() {
    const list = visible();
    const box = host.querySelector('#h-list');
    if (!list.length) { box.innerHTML = '<div class="card empty"><h2>Sin resultados</h2><p>Ninguna venta coincide con la búsqueda.</p></div>'; return; }
    box.innerHTML = list.slice(0, ui.shown).map((s) => `
      <button type="button" class="card hrow" data-id="${s.id}">
        <span><strong>${escapeHtml(s.folio)}</strong>
          ${s.status === 'cancelled' ? '<span class="badge warn">Cancelada</span>' : ''}<br>
          <span class="muted small">${escapeHtml(formatDateTime(s.createdAt))}${s.customer ? ' · ' + escapeHtml(s.customer) : ''} · ${s.items.length} artículo(s)</span></span>
        <strong class="${s.status === 'cancelled' ? 'strike' : ''}">${money(s.total)}</strong>
      </button>`).join('') + (list.length > ui.shown ? '<button type="button" class="btn" id="h-more">Ver más</button>' : '');
  }

  function drawDetail() {
    const sale = sales.find((s) => s.id === ui.detailId);
    if (!sale) { ui.detailId = null; return draw(); }
    const cfg = getConfig();
    host.innerHTML = `
      <div class="row" style="margin-bottom:16px"><button type="button" class="btn" id="d-back">← Volver al historial</button></div>
      ${sale.status === 'cancelled' ? `<div class="notice warn" style="margin-bottom:16px"><strong>Venta cancelada</strong> el ${escapeHtml(formatDateTime(sale.cancelled.at))}.<br>Motivo: ${escapeHtml(sale.cancelled.reason)}</div>` : ''}
      <div class="card stack">
        <div class="ticket-paper"><style>${TICKET_CSS}</style>${ticketBody(sale, cfg)}</div>
        <div class="row">
          <button type="button" class="btn btn-primary" id="d-print">Imprimir / guardar PDF</button>
          ${sale.status === 'completed' && cfg.sales.cancelEnabled ? '<button type="button" class="btn btn-danger" id="d-cancel">Cancelar venta</button>' : ''}
        </div>
        <p class="muted small">En el diálogo de impresión elige “Guardar como PDF” si quieres un archivo.</p>
      </div>`;
    host.querySelector('#d-back').addEventListener('click', () => { ui.detailId = null; draw(); window.scrollTo(0, 0); });
    host.querySelector('#d-print').addEventListener('click', () => printTicket(sale, getConfig()));
    host.querySelector('#d-cancel')?.addEventListener('click', async () => {
      const reason = await promptDialog({
        title: `Cancelar venta ${sale.folio}`,
        message: 'Se devolverán las existencias al inventario. La cancelación queda registrada y no se puede deshacer.',
        label: 'Motivo de la cancelación', confirmText: 'Cancelar venta', danger: true,
        validate: (v) => (v.trim().length >= 3 ? '' : 'Escribe el motivo (mínimo 3 caracteres).')
      });
      if (reason === null) return;
      try {
        const rules = getConfig().sales;
        await store.cancelSale(sale.id, reason, { enabled: rules.cancelEnabled, maxDays: rules.cancelDays });
        toast('Venta cancelada', 'ok');
        await reload();
      } catch (err) {
        await openModal({ title: 'No se pudo cancelar', message: err.message });
      }
    });
  }

  draw();
}
