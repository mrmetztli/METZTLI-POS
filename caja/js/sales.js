// sales.js — pantalla "Nueva venta": catálogo + carrito + cobro, y pestaña de historial.
// Las reglas (totales, pagos, folios, existencias) están en sales-store.js.
import { mountDemoBanner } from './demo-banner.js';
import * as store from './sales-store.js';
import * as catalog from './catalog-store.js';
import { getConfig } from './state.js';
import { toast, openModal, promptDialog, confirmDialog, productThumb, askNumpad } from './components.js';
import { escapeHtml, money, uid } from './utilities.js';
import { askPayment } from './checkout.js';
import { printTicket } from './tickets.js';
import { renderHistory } from './sales-history.js';
import { openBarcodeScanner } from './barcode-scan.js';

const round3 = (n) => Math.round(n * 1000) / 1000;
const newCart = () => ({ id: uid(), lines: [], discount: { type: 'percent', value: '' }, customer: '', notes: '' });

// El carrito y los filtros se conservan mientras la app esté abierta (no al recargar la página).
let cart = newCart();
const ui = { tab: 'sell', search: '', category: 'all' };
let root = null;
let products = [];
let cats = [];
let busy = false;

async function load() {
  [products, cats] = await Promise.all([catalog.listProducts(), catalog.listCategories()]);
  products = products.filter((p) => p.active);
}

// Lo usa el Dashboard para abrir la app directamente en la pestaña Historial.
export function showHistoryNext() { ui.tab = 'history'; }

export async function render(container) {
  root = container;
  await load();
  draw();
}

const methodsOf = (cfg) => [{ label: 'Efectivo', cash: true }, ...cfg.sales.otherMethods.map((label) => ({ label, cash: false }))];

// Dibuja la pantalla y, si hay datos de PRUEBA cargados, muestra el aviso para no confundirlos con ventas reales.
function draw() {
  drawScreen();
  if (true) mountDemoBanner(root, () => render(root));
}

function drawScreen() {
  root.innerHTML = `
    <header class="page-head row between">
      <div><h1>Nueva venta</h1><p class="muted">Registra una operación o consulta el historial</p></div>
      <div class="seg" role="group" aria-label="Sección">
        <button type="button" data-tab="sell" aria-pressed="${ui.tab === 'sell'}">Vender</button>
        <button type="button" data-tab="free" aria-pressed="${ui.tab === 'free'}">Libre</button>
        <button type="button" data-tab="history" aria-pressed="${ui.tab === 'history'}">Historial</button>
      </div>
    </header><div id="tab"></div>`;
  root.querySelector('.seg').addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-tab]')?.dataset.tab;
    if (!tab || tab === ui.tab) return;
    ui.tab = tab;
    await load();
    draw();
  });
  const host = root.querySelector('#tab');
  if (ui.tab === 'history') renderHistory(host);
  else if (ui.tab === 'free') drawFree(host);
  else drawSell(host);
}

/* ---------- Vender ---------- */

function drawSell(host) {
  if (!products.length) {
    host.innerHTML = `<div class="card empty"><h2>Aún no tienes productos para vender</h2>
      <p>Crea productos en el Catálogo, o usa la pestaña <strong>Libre</strong> para cobrar un monto sin catálogo.</p>
      <div class="row" style="justify-content:center;gap:12px;margin-top:8px">
        <a class="btn btn-primary" href="#/catalog">Ir al Catálogo</a>
        <button type="button" class="btn" id="go-free-tab">Ir a Libre</button>
      </div></div>`;
    host.querySelector('#go-free-tab')?.addEventListener('click', () => {
      ui.tab = 'free';
      draw();
    });
    return;
  }
  host.innerHTML = `
    <div class="pos">
      <section class="pos-catalog">
        <button type="button" class="btn btn-scan" id="pos-scan" aria-label="Escanear código de barras con la cámara">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
            <path d="M7 8h10M7 12h10M7 16h6"/>
          </svg>
          Escanear código de barras
        </button>
        <div class="chips" id="chips" role="group" aria-label="Categorías"></div>
        <div id="quick"></div>
        <div id="pgrid"></div>
      </section>
      <aside class="pos-cart" id="cart" aria-label="Carrito"></aside>
    </div>
    <button type="button" class="cart-bar" id="cart-bar" hidden></button>`;

  const $ = (s) => host.querySelector(s);

  const addByCode = (code) => {
    const term = String(code || '').trim().toLowerCase();
    if (!term) return;
    const exact = products.filter((p) => [p.barcode, p.sku].some((v) => v && v.toLowerCase() === term));
    if (exact.length === 1) {
      addToCart(exact[0].id, 1, { fromScan: true });
      return;
    }
    if (exact.length > 1) {
      toast(`Varios productos con “${code}”. Elige uno en la lista.`, 'error');
      return;
    }
    // Coincidencia parcial por nombre solo si es única
    const soft = products.filter((p) =>
      [p.barcode, p.sku, p.name].some((v) => String(v || '').toLowerCase() === term)
    );
    if (soft.length === 1) {
      addToCart(soft[0].id, 1, { fromScan: true });
      return;
    }
    toast(`No hay producto con código “${code}”`, 'error');
  };

  $('#pos-scan').addEventListener('click', async () => {
    const code = await openBarcodeScanner({
      title: 'Escanear producto',
      hint: 'Apunta al código de barras o QR del producto para agregarlo al carrito.'
    });
    if (code) addByCode(code);
  });

  $('#chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]')?.dataset.cat;
    if (c) { ui.category = c; drawChips(); drawGrid(); }
  });
  host.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) addToCart(add.dataset.add);
  });
  $('#cart-bar').addEventListener('click', () => $('#cart').classList.add('open'));
  wireCart($('#cart'));
  drawChips(); drawQuick(); drawGrid(); drawCart();
}

/* ---------- Venta libre (pestaña con teclado numérico) ---------- */

function drawFree(host) {
  let buffer = '';
  let fresh = true;
  const QUICK = [20, 50, 100, 200, 500, 1000];

  host.innerHTML = `
    <div class="pos pos-free">
      <section class="free-panel card card-dark">
        <h2>Venta libre</h2>
        <p class="muted small">Cobra un monto sin producto del catálogo. Puedes sumarlo al carrito o cobrarlo ya.</p>
        <div class="field">
          <label for="free-name">Concepto</label>
          <input id="free-name" class="input" maxlength="80" value="Monto libre" placeholder="Ej. Servicio, anticipo, extra…">
        </div>
        <div class="numpad free-numpad" id="free-pad">
          <div class="numpad-display" id="free-display">$0.00</div>
          <div class="numpad-quick" id="free-quick">
            ${QUICK.map((v) => `<button type="button" class="num-quick" data-amount="${v}">$${v}</button>`).join('')}
          </div>
          <div class="numpad-grid">
            <button type="button" class="num-key" data-k="7">7</button>
            <button type="button" class="num-key" data-k="8">8</button>
            <button type="button" class="num-key" data-k="9">9</button>
            <button type="button" class="num-key num-key-action" data-k="back">⌫</button>
            <button type="button" class="num-key" data-k="4">4</button>
            <button type="button" class="num-key" data-k="5">5</button>
            <button type="button" class="num-key" data-k="6">6</button>
            <button type="button" class="num-key num-key-action" data-k="clear">C</button>
            <button type="button" class="num-key" data-k="1">1</button>
            <button type="button" class="num-key" data-k="2">2</button>
            <button type="button" class="num-key" data-k="3">3</button>
            <button type="button" class="num-key" data-k="00">00</button>
            <button type="button" class="num-key" data-k=".">.</button>
            <button type="button" class="num-key" data-k="0">0</button>
            <button type="button" class="num-key num-key-ok" data-k="add" style="grid-column: span 2">+ Al carrito</button>
          </div>
          <button type="button" class="btn btn-primary btn-lg" id="free-charge" style="margin-top:10px;width:100%">Cobrar solo este monto</button>
        </div>
      </section>
      <aside class="pos-cart" id="cart" aria-label="Carrito"></aside>
    </div>
    <button type="button" class="cart-bar" id="cart-bar" hidden></button>`;

  const $ = (s) => host.querySelector(s);
  const display = $('#free-display');
  const nameInput = $('#free-name');

  const updateDisplay = () => {
    const n = buffer === '' ? 0 : Number(buffer);
    display.textContent = Number.isFinite(n) ? money(n) : '$0.00';
  };

  const parseAmount = () => {
    const n = buffer === '' ? 0 : Number(buffer);
    if (!Number.isFinite(n) || n < 0) { toast('Escribe un monto válido', 'error'); return null; }
    if (n === 0) { toast('El monto debe ser mayor a 0', 'error'); return null; }
    return Math.round(n * 100) / 100;
  };

  const makeFreeLine = (unitPrice) => ({
    productId: `__free_${uid()}`,
    qty: 1,
    unitPrice,
    name: String(nameInput.value || 'Monto libre').trim() || 'Monto libre',
    custom: true
  });

  const addToCartFree = () => {
    const unitPrice = parseAmount();
    if (unitPrice == null) return;
    const line = makeFreeLine(unitPrice);
    cart.lines.push(line);
    buffer = '';
    fresh = true;
    updateDisplay();
    drawCart();
    toast(`✓ ${line.name} · ${money(unitPrice)}`, 'ok');
  };

  const chargeFree = async () => {
    if (busy) return;
    const unitPrice = parseAmount();
    if (unitPrice == null) return;
    const freeLines = [makeFreeLine(unitPrice)];
    busy = true;
    try {
      const cfg = getConfig();
      const totals = store.calcTotals(freeLines, { type: 'percent', value: '' });
      const payments = await askPayment({ total: totals.total, methods: methodsOf(cfg), itemCount: 1 });
      if (!payments) return;
      if (cfg.sales.confirmBeforeSave) {
        const yes = await confirmDialog({
          title: '¿Guardar la venta?',
          message: `${freeLines[0].name} · Total ${money(totals.total)}`,
          confirmText: 'Guardar venta'
        });
        if (!yes) return;
      }
      let sale;
      try {
        sale = await store.createSale({
          id: uid(),
          lines: freeLines,
          discount: { type: 'percent', value: '' },
          payments,
          customer: '',
          notes: ''
        }, cfg);
      } catch (err) {
        await openModal({ title: 'No se pudo guardar la venta', message: err.message });
        return;
      }
      buffer = '';
      fresh = true;
      updateDisplay();
      const choice = await openModal({
        title: `Venta ${sale.folio} registrada`,
        message: `Total ${money(sale.total)}${sale.change > 0 ? ` · Cambio a entregar: ${money(sale.change)}` : ''}`,
        actions: [{ label: 'Imprimir ticket', value: 'print' }, { label: 'Nueva venta', value: 'new', kind: 'primary' }]
      });
      if (choice === 'print') printTicket(sale);
    } finally {
      busy = false;
    }
  };

  const press = (k) => {
    if (k === 'add') { addToCartFree(); return; }
    if (k === 'clear') { buffer = ''; fresh = true; updateDisplay(); return; }
    if (k === 'back') {
      if (fresh) { buffer = ''; fresh = false; }
      else buffer = buffer.slice(0, -1);
      updateDisplay();
      return;
    }
    if (k === '.') {
      if (fresh) { buffer = '0.'; fresh = false; }
      else if (!buffer.includes('.')) buffer += '.';
      updateDisplay();
      return;
    }
    if (k === '00') {
      if (fresh) { buffer = '0'; fresh = false; }
      else {
        const parts = buffer.split('.');
        if (parts[1] !== undefined && parts[1].length >= 2) return;
        if (parts[1] !== undefined) buffer += '0'.repeat(Math.min(2, 2 - parts[1].length));
        else buffer += '00';
      }
      updateDisplay();
      return;
    }
    if (/^\d$/.test(k)) {
      if (fresh) { buffer = k === '0' ? '0' : k; fresh = false; }
      else {
        const parts = buffer.split('.');
        if (parts[1] !== undefined && parts[1].length >= 2) return;
        if (buffer === '0' && k !== '.') buffer = k;
        else buffer += k;
      }
      updateDisplay();
    }
  };

  $('#free-pad').addEventListener('click', (e) => {
    const key = e.target.closest('[data-k]')?.dataset.k;
    if (key) press(key);
    const amt = e.target.closest('[data-amount]')?.dataset.amount;
    if (amt !== undefined) {
      buffer = Number(amt).toFixed(2);
      fresh = true;
      updateDisplay();
    }
  });
  $('#free-charge').addEventListener('click', () => chargeFree());

  const onKey = (e) => {
    if (ui.tab !== 'free') return;
    if (e.target === nameInput) return;
    if (e.key === 'Enter') { e.preventDefault(); press('add'); return; }
    if (e.key === 'Backspace') { e.preventDefault(); press('back'); return; }
    if (e.key === 'Delete') { e.preventDefault(); press('clear'); return; }
    if (e.key === '.') { e.preventDefault(); press('.'); return; }
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); return; }
  };
  document.addEventListener('keydown', onKey);
  const obs = new MutationObserver(() => {
    if (!root.contains(host)) {
      document.removeEventListener('keydown', onKey);
      obs.disconnect();
    }
  });
  obs.observe(root, { childList: true, subtree: true });

  $('#cart-bar').addEventListener('click', () => $('#cart').classList.add('open'));
  wireCart($('#cart'));
  drawCart();
}

function filtered() {
  const q = ui.search.trim().toLowerCase();
  const cc = getConfig().catalog;
  const list = products.filter((p) => {
    if (ui.category !== 'all' && p.categoryId !== ui.category) return false;
    return !q || [p.name, p.sku, p.barcode, p.description].some((v) => String(v || '').toLowerCase().includes(q));
  });
  return catalog.sortProducts(list, cc.sort, cc.featuredFirst); // mismo orden que el Catálogo
}

function drawChips() {
  const visible = cats.filter((c) => !c.hidden);
  root.querySelector('#chips').innerHTML = [['all', 'Todo'], ...visible.map((c) => [c.id, `${c.icon} ${c.name}`])]
    .map(([id, label]) => `<button type="button" class="chip" data-cat="${escapeHtml(id)}" aria-pressed="${id === ui.category}">${escapeHtml(label)}</button>`).join('');
}

const thumb = (p) => productThumb(p, cats.find((c) => c.id === p.categoryId), getConfig().catalog.placeholder);

const soldOut = (p) => p.trackStock && p.stock <= 0;

function drawQuick() {
  const quick = catalog.orderQuick(products, getConfig().catalog.quickOrder); // en el orden elegido en Catálogo → Personalizar
  root.querySelector('#quick').innerHTML = quick.length
    ? `<div class="quick-row" aria-label="Venta rápida">${quick.map((p) => `
        <button type="button" class="quick-btn" data-add="${p.id}" ${soldOut(p) ? 'disabled' : ''}>
          <strong>${escapeHtml(p.name)}</strong><span>${money(p.price)}</span></button>`).join('')}</div>`
    : '<p class="muted small" style="margin-bottom:12px">Marca productos como “venta rápida” en el Catálogo para tenerlos aquí a un toque.</p>';
}

function drawGrid() {
  const list = filtered();
  root.querySelector('#pgrid').innerHTML = list.length
    ? `<div class="pgrid">${list.map((p) => `
        <button type="button" class="pcard" data-add="${p.id}" ${soldOut(p) ? 'disabled' : ''}>
          <span class="pcard-media">${thumb(p)}</span>
          <span class="pcard-body"><strong>${escapeHtml(p.name)}</strong>
            <span class="price">${money(p.price)}</span>
            ${soldOut(p) ? '<span class="badge warn">Sin existencias</span>' : ''}</span></button>`).join('')}</div>`
    : '<div class="card empty"><h2>Sin resultados</h2><p>Ningún producto coincide con la búsqueda.</p></div>';
}

/* ---------- Carrito ---------- */

function addToCart(productId, qty = 1, opts = {}) {
  const p = products.find((x) => x.id === productId);
  if (!p) return;
  const line = cart.lines.find((l) => l.productId === productId && !l.custom);
  const next = round3((line?.qty || 0) + qty);
  if (p.trackStock && next > p.stock) { toast(`Solo hay ${p.stock} ${p.unit} de “${p.name}”`, 'error'); return; }
  if (line) line.qty = next; else cart.lines.push({ productId, qty, unitPrice: p.price });
  drawCart();
  if (opts.fromScan) toast(`✓ ${p.name}`, 'ok');
}

function drawCart() {
  const host = root.querySelector('#cart');
  if (!host) return;
  // Conserva líneas libres; solo limpia productos de catálogo que ya no existen
  cart.lines = cart.lines.filter((l) => l.custom || products.some((p) => p.id === l.productId));
  const cfg = getConfig();
  const t = store.calcTotals(cart.lines, cart.discount);
  const empty = !cart.lines.length;
  const lines = cart.lines.map((l) => {
    if (l.custom) {
      const label = l.name || 'Monto libre';
      return `<div class="cline" data-id="${escapeHtml(l.productId)}">
        <div class="cline-main"><strong>${escapeHtml(label)}</strong>
          <button type="button" class="linkbtn" data-act="price">${money(l.unitPrice)}</button>
          <span class="badge">Libre</span></div>
        <button type="button" class="btn btn-sm" data-act="remove" aria-label="Quitar ${escapeHtml(label)}">✕</button>
        <div class="stepper">
          <button type="button" data-act="dec" aria-label="Menos">−</button>
          <button type="button" class="qty qty-btn" data-act="qty" aria-label="Cantidad ${l.qty}">${l.qty}</button>
          <button type="button" data-act="inc" aria-label="Más">+</button></div>
        <div class="cline-total">${money(store.lineTotal(l.unitPrice, l.qty))}</div></div>`;
    }
    const p = products.find((x) => x.id === l.productId);
    const modified = l.unitPrice !== p.price;
    const priceLabel = `${money(l.unitPrice)}${p.unit && !['pieza', 'servicio'].includes(p.unit) ? ` / ${escapeHtml(p.unit)}` : ''}`;
    return `<div class="cline" data-id="${l.productId}">
      <div class="cline-main"><strong>${escapeHtml(p.name)}</strong>
        ${cfg.sales.priceEdit === 'allow'
          ? `<button type="button" class="linkbtn" data-act="price">${priceLabel}</button>`
          : `<span class="muted">${priceLabel}</span>`}
        ${modified ? '<span class="badge">Precio modificado</span>' : ''}</div>
      <button type="button" class="btn btn-sm" data-act="remove" aria-label="Quitar ${escapeHtml(p.name)}">✕</button>
      <div class="stepper">
        <button type="button" data-act="dec" aria-label="Menos">−</button>
        <button type="button" class="qty qty-btn" data-act="qty" aria-label="Cantidad ${l.qty}">${l.qty}</button>
        <button type="button" data-act="inc" aria-label="Más">+</button></div>
      <div class="cline-total">${money(store.lineTotal(l.unitPrice, l.qty))}</div></div>`;
  }).join('');

  host.innerHTML = `<div class="card cart-card">
    <div class="row between"><h2>Carrito</h2>
      <div class="row"><button type="button" class="btn btn-sm" data-act="clear" ${empty ? 'disabled' : ''}>Vaciar</button>
        <button type="button" class="btn btn-sm cart-close" data-act="close">Cerrar</button></div></div>
    ${empty ? '<p class="muted cart-empty">Toca un producto para agregarlo.</p>' : lines}
    <div class="cart-totals">
      <div class="ln"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${cfg.sales.discountsEnabled ? `<div class="ln"><span>Descuento</span><span class="row" style="gap:6px">
        <select data-f="dtype" class="input mini" aria-label="Tipo de descuento">
          <option value="percent" ${cart.discount.type === 'percent' ? 'selected' : ''}>%</option>
          <option value="amount" ${cart.discount.type === 'amount' ? 'selected' : ''}>$</option></select>
        <input data-f="dvalue" class="input mini" type="number" inputmode="decimal" min="0" step="any" placeholder="0" aria-label="Valor del descuento" value="${escapeHtml(cart.discount.value)}"></span></div>` : ''}
      ${t.discount > 0 ? `<div class="ln muted"><span>Descuento aplicado</span><span>-${money(t.discount)}</span></div>` : ''}
      <div class="ln total"><span>Total</span><span>${money(t.total)}</span></div>
    </div>
    <div class="field"><label for="cart-customer">Cliente o referencia (opcional)</label>
      <input id="cart-customer" class="input" maxlength="80" value="${escapeHtml(cart.customer)}"></div>
    <div class="field"><label for="cart-notes">Notas (opcional)</label>
      <input id="cart-notes" class="input" maxlength="200" value="${escapeHtml(cart.notes)}"></div>
    <div class="cart-foot"><button type="button" class="btn btn-primary btn-lg" data-act="charge" ${empty ? 'disabled' : ''}>Cobrar ${money(t.total)}</button></div>
  </div>`;

  const bar = root.querySelector('#cart-bar');
  if (bar) {
    bar.hidden = empty;
    bar.textContent = `Ver carrito · ${cart.lines.length} · ${money(t.total)}`;
  }
}

function wireCart(el) {
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const id = e.target.closest('.cline')?.dataset.id;
    const line = cart.lines.find((l) => l.productId === id);
    if (act === 'close') el.classList.remove('open');
    if (act === 'clear') { cart = newCart(); drawCart(); }
    if (act === 'remove') { cart.lines = cart.lines.filter((l) => l !== line); drawCart(); }
    if (act === 'inc') {
      if (line?.custom) { line.qty = round3(line.qty + 1); drawCart(); }
      else addToCart(id, 1);
    }
    if (act === 'dec') {
      if (!line) return;
      line.qty = round3(line.qty - 1);
      if (line.qty <= 0) cart.lines = cart.lines.filter((l) => l !== line);
      drawCart();
    }
    if (act === 'qty') {
      if (!line) return;
      const p = line.custom ? null : products.find((x) => x.id === id);
      const maxStock = p?.trackStock ? p.stock : null;
      const unitHint = p?.unit && !['pieza', 'servicio'].includes(p.unit) ? ` (${p.unit})` : '';
      const qty = await askNumpad({
        title: 'Cantidad',
        message: line.custom
          ? (line.name || 'Monto libre')
          : `${p?.name || ''}${unitHint}${maxStock != null ? ` · Disponible: ${maxStock}` : ''}`,
        value: line.qty,
        decimals: 3, // permite 0.5 kg, 1.25 l, etc.
        min: 0.001,
        max: maxStock,
        allowZero: false,
        confirmText: 'Aplicar',
        quick: [1, 2, 3, 5, 10, 12]
      });
      if (qty === null) return;
      if (maxStock != null && qty > maxStock) {
        toast(`Solo hay ${maxStock} ${p.unit} de “${p.name}”`, 'error');
        return;
      }
      line.qty = round3(qty);
      if (line.qty <= 0) cart.lines = cart.lines.filter((l) => l !== line);
      drawCart();
    }
    if (act === 'price') {
      if (line?.custom) {
        const value = await promptDialog({
          title: 'Cambiar monto', message: 'Monto libre de esta línea.',
          label: 'Monto (MXN)', value: String(line.unitPrice), type: 'number', inputMode: 'decimal', step: '0.01', confirmText: 'Aplicar',
          validate: (v) => (v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? '' : 'Escribe un monto válido (0 o más).')
        });
        if (value !== null) { line.unitPrice = Math.round(Number(value) * 100) / 100; drawCart(); }
      } else {
        const p = products.find((x) => x.id === id);
        const value = await promptDialog({
          title: 'Cambiar precio', message: `Precio normal: ${money(p.price)}. El cambio aplica solo a esta venta.`,
          label: 'Precio unitario (MXN)', value: String(line.unitPrice), type: 'number', inputMode: 'decimal', step: '0.01', confirmText: 'Aplicar',
          validate: (v) => (v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? '' : 'Escribe un precio válido (0 o más).')
        });
        if (value !== null) { line.unitPrice = Math.round(Number(value) * 100) / 100; drawCart(); }
      }
    }
    if (act === 'charge') charge(el);
  });
  el.addEventListener('change', (e) => {
    if (e.target.dataset.f === 'dtype') { cart.discount.type = e.target.value; drawCart(); }
    if (e.target.dataset.f === 'dvalue') { cart.discount.value = e.target.value; drawCart(); }
  });
  el.addEventListener('input', (e) => {
    if (e.target.id === 'cart-customer') cart.customer = e.target.value;
    if (e.target.id === 'cart-notes') cart.notes = e.target.value;
  });
}

async function charge(cartEl) {
  if (busy || !cart.lines.length) return; // evita cobrar dos veces por pulsaciones repetidas
  busy = true;
  try {
    const cfg = getConfig();
    const totals = store.calcTotals(cart.lines, cart.discount);
    const payments = await askPayment({ total: totals.total, methods: methodsOf(cfg), itemCount: cart.lines.length });
    if (!payments) return;
    if (cfg.sales.confirmBeforeSave) { // confirmación extra, si se activó en Configuración
      const yes = await confirmDialog({ title: '¿Guardar la venta?', message: `${cart.lines.length} artículo(s) · Total ${money(totals.total)}`, confirmText: 'Guardar venta' });
      if (!yes) return;
    }
    let sale;
    try {
      sale = await store.createSale({ id: cart.id, lines: cart.lines, discount: cart.discount, payments, customer: cart.customer, notes: cart.notes }, cfg);
    } catch (err) {
      await openModal({ title: 'No se pudo guardar la venta', message: err.message });
      await load();
      drawGrid(); drawQuick(); drawCart();
      return;
    }
    cart = newCart();
    cartEl.classList.remove('open');
    await load();
    drawGrid(); drawQuick(); drawCart();
    const choice = await openModal({
      title: `Venta ${sale.folio} registrada`,
      message: `Total ${money(sale.total)}${sale.change > 0 ? ` · Cambio a entregar: ${money(sale.change)}` : ''}`,
      actions: [{ label: 'Imprimir ticket', value: 'print' }, { label: 'Nueva venta', value: 'new', kind: 'primary' }]
    });
    if (choice === 'print') printTicket(sale, cfg);
  } finally {
    busy = false;
  }
}
