// clients.js — pantalla Clientes: listado, alta/edición e historial de compras.
import * as store from './clients-store.js';
import * as salesStore from './sales-store.js';
import { pageHeader, emptyState, toast, confirmDialog, openModal } from './components.js';
import { escapeHtml, money, formatDateTime } from './utilities.js';

const ui = { view: 'list', clientId: null, search: '' };
let root = null;
let clients = [];
let sales = [];

async function load() {
  const [saved, allSales] = await Promise.all([store.listClients(), salesStore.listSales()]);
  sales = allSales;
  clients = store.buildClientDirectory(saved, allSales);
}

export async function render(container) {
  root = container;
  await load();
  draw();
}

function draw() {
  if (ui.view === 'detail' && ui.clientId) drawDetail();
  else if (ui.view === 'form') drawForm();
  else drawList();
}

function filtered() {
  const q = ui.search.trim().toLowerCase();
  if (!q) return clients;
  return clients.filter((c) => {
    const stats = store.statsOfClient(c, sales);
    return [c.name, c.phone, String(stats.salesCount), String(stats.totalPaid)]
      .some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function drawList() {
  const list = filtered();
  root.innerHTML = `
    ${pageHeader('Clientes', 'Historial de compras por nombre y teléfono')}
    <div class="toolbar no-print">
      <input class="input grow" id="cl-q" type="search" placeholder="Buscar por nombre o teléfono" aria-label="Buscar cliente" value="${escapeHtml(ui.search)}">
      <button type="button" class="btn btn-primary" id="cl-new">Nuevo cliente</button>
    </div>
    <div id="cl-list" class="stack"></div>`;

  const box = root.querySelector('#cl-list');
  if (!clients.length) {
    box.innerHTML = emptyState({
      icon: 'users',
      title: 'Aún no hay clientes',
      text: 'Crea un cliente o escribe un nombre en el campo “Cliente” al cobrar una venta. Aquí verás sus compras y totales.',
      actionId: 'cl-empty-new',
      actionLabel: 'Nuevo cliente'
    });
    root.querySelector('#cl-empty-new')?.addEventListener('click', () => {
      ui.view = 'form';
      ui.clientId = null;
      draw();
    });
  } else if (!list.length) {
    box.innerHTML = `<div class="card empty"><h2>Sin resultados</h2><p>Ningún cliente coincide con “${escapeHtml(ui.search)}”.</p></div>`;
  } else {
    box.innerHTML = list.map((c) => {
      const st = store.statsOfClient(c, sales);
      return `<button type="button" class="card client-row" data-id="${escapeHtml(c.id)}">
        <div class="client-main">
          <strong class="client-name">${escapeHtml(c.name)}</strong>
          <span class="muted small">${c.phone ? escapeHtml(c.phone) : 'Sin teléfono'}${c.virtual ? ' · desde ventas' : ''}</span>
        </div>
        <div class="client-stats">
          <span><span class="muted small">Ventas</span><strong>${st.salesCount}</strong></span>
          <span><span class="muted small">Total pagado</span><strong>${money(st.totalPaid)}</strong></span>
        </div>
      </button>`;
    }).join('');
  }

  const paintRows = () => {
    const list = filtered();
    if (!clients.length) return;
    if (!list.length) {
      box.innerHTML = `<div class="card empty"><h2>Sin resultados</h2><p>Ningún cliente coincide con “${escapeHtml(ui.search)}”.</p></div>`;
      return;
    }
    box.innerHTML = list.map((c) => {
      const st = store.statsOfClient(c, sales);
      return `<button type="button" class="card client-row" data-id="${escapeHtml(c.id)}">
        <div class="client-main">
          <strong class="client-name">${escapeHtml(c.name)}</strong>
          <span class="muted small">${c.phone ? escapeHtml(c.phone) : 'Sin teléfono'}${c.virtual ? ' · desde ventas' : ''}</span>
        </div>
        <div class="client-stats">
          <span><span class="muted small">Ventas</span><strong>${st.salesCount}</strong></span>
          <span><span class="muted small">Total pagado</span><strong>${money(st.totalPaid)}</strong></span>
        </div>
      </button>`;
    }).join('');
  };
  root.querySelector('#cl-q').addEventListener('input', (e) => {
    ui.search = e.target.value;
    paintRows();
  });
  root.querySelector('#cl-new').addEventListener('click', () => {
    ui.view = 'form';
    ui.clientId = null;
    draw();
  });
  box.addEventListener('click', (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    ui.view = 'detail';
    ui.clientId = id;
    draw();
  });
}

function findClient(id) {
  return clients.find((c) => c.id === id) || null;
}

function drawDetail() {
  const c = findClient(ui.clientId);
  if (!c) {
    ui.view = 'list';
    ui.clientId = null;
    drawList();
    return;
  }
  const st = store.statsOfClient(c, sales);
  const history = st.sales.map((s) => {
    const items = (s.items || []).map((it) => {
      const label = it.name || 'Artículo';
      const qty = it.qty != null ? it.qty : 1;
      const kind = it.type === 'service' || it.custom ? 'servicio' : 'producto';
      return `${qty} × ${label} (${kind})`;
    }).join(', ') || '—';
    return `<div class="card client-sale">
      <div class="row between">
        <div>
          <strong>${escapeHtml(s.folio || '')}</strong>
          <span class="muted small"> · ${escapeHtml(formatDateTime(s.createdAt))}</span>
        </div>
        <strong>${money(s.total)}</strong>
      </div>
      <p class="muted small client-sale-items">${escapeHtml(items)}</p>
      <div class="muted small">${(s.payments || []).map((p) => `${escapeHtml(p.method)} ${money(p.amount)}`).join(' · ') || '—'}</div>
    </div>`;
  }).join('');

  root.innerHTML = `
    <header class="page-head row between">
      <div>
        <button type="button" class="btn btn-sm" id="cl-back">← Clientes</button>
        <h1 style="margin-top:10px">${escapeHtml(c.name)}</h1>
        <p class="muted">${c.phone ? escapeHtml(c.phone) : 'Sin teléfono'}${c.virtual ? ' · registro generado desde ventas' : ''}</p>
      </div>
      <div class="row">
        ${c.virtual
          ? '<button type="button" class="btn btn-primary" id="cl-save-as">Guardar ficha</button>'
          : '<button type="button" class="btn" id="cl-edit">Editar</button>'}
      </div>
    </header>
    <div class="kpis client-kpis">
      <div class="card kpi"><span class="muted small">Ventas registradas</span><strong class="kpi-value">${st.salesCount}</strong></div>
      <div class="card kpi"><span class="muted small">Total pagado</span><strong class="kpi-value">${money(st.totalPaid)}</strong></div>
    </div>
    <section class="stack" style="margin-top:14px">
      <h2>Historial de compras</h2>
      ${history || '<div class="card empty"><h2>Sin compras</h2><p>Este cliente aún no tiene ventas registradas a su nombre.</p></div>'}
    </section>`;

  root.querySelector('#cl-back').addEventListener('click', () => {
    ui.view = 'list';
    ui.clientId = null;
    draw();
  });
  root.querySelector('#cl-edit')?.addEventListener('click', () => {
    ui.view = 'form';
    draw();
  });
  root.querySelector('#cl-save-as')?.addEventListener('click', async () => {
    try {
      const saved = await store.saveClient({ name: c.name, phone: c.phone || '', notes: '' });
      toast('Ficha de cliente guardada', 'ok');
      await load();
      ui.clientId = saved.id;
      ui.view = 'detail';
      draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function drawForm() {
  const existing = ui.clientId && !String(ui.clientId).startsWith('__fromsale__')
    ? await store.getClient(ui.clientId)
    : null;
  const c = existing || { name: '', phone: '', notes: '' };

  root.innerHTML = `
    ${pageHeader(existing ? 'Editar cliente' : 'Nuevo cliente', 'Nombre y teléfono para localizar sus ventas')}
    <form class="card stack" id="cl-form" novalidate>
      <div class="notice warn" id="cl-error" hidden role="alert"></div>
      <div class="form-grid">
        <div class="field"><label for="f-name">Nombre</label>
          <input id="f-name" class="input" maxlength="80" required value="${escapeHtml(c.name)}"></div>
        <div class="field"><label for="f-phone">Teléfono</label>
          <input id="f-phone" class="input" maxlength="30" inputmode="tel" value="${escapeHtml(c.phone || '')}" placeholder="Opcional"></div>
      </div>
      <div class="field"><label for="f-notes">Notas (opcional)</label>
        <textarea id="f-notes" class="input textarea" maxlength="300">${escapeHtml(c.notes || '')}</textarea></div>
      <div class="row">
        <button type="submit" class="btn btn-primary" id="cl-save">Guardar</button>
        <button type="button" class="btn" id="cl-cancel">Cancelar</button>
        ${existing ? '<button type="button" class="btn btn-danger" id="cl-del">Eliminar</button>' : ''}
      </div>
    </form>`;

  const back = () => {
    if (existing) { ui.view = 'detail'; ui.clientId = existing.id; }
    else { ui.view = 'list'; ui.clientId = null; }
    draw();
  };
  root.querySelector('#cl-cancel').addEventListener('click', back);
  root.querySelector('#cl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = root.querySelector('#cl-save');
    btn.disabled = true;
    try {
      const saved = await store.saveClient({
        id: existing?.id,
        name: root.querySelector('#f-name').value,
        phone: root.querySelector('#f-phone').value,
        notes: root.querySelector('#f-notes').value
      });
      toast('Cliente guardado', 'ok');
      await load();
      ui.view = 'detail';
      ui.clientId = saved.id;
      draw();
    } catch (err) {
      const box = root.querySelector('#cl-error');
      box.textContent = err.message;
      box.hidden = false;
      btn.disabled = false;
    }
  });
  root.querySelector('#cl-del')?.addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: '¿Eliminar cliente?',
      message: 'Se borra la ficha. Las ventas históricas no se eliminan.',
      confirmText: 'Eliminar'
    });
    if (!yes) return;
    try {
      await store.deleteClient(existing.id);
      toast('Cliente eliminado', 'ok');
      ui.view = 'list';
      ui.clientId = null;
      await load();
      draw();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  root.querySelector('#f-name').focus();
}
