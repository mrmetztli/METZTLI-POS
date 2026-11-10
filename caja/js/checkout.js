// checkout.js — ventana de cobro con teclado numérico claymorphism.
// Devuelve la lista de pagos o null si se cancela. La validación vive en sales-store.js.
import { money, escapeHtml } from './utilities.js';
import { validatePayments } from './sales-store.js';

const QUICK_CASH = [20, 50, 100, 200, 500, 1000];

// methods: [{ label, cash }]
export function askPayment({ total, methods, itemCount }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const previous = document.activeElement;
    // Fila activa del teclado (por defecto la primera)
    let activeRow = 0;
    const rows = [{ m: 0, amount: total > 0 ? total.toFixed(2) : '' }];
    // Buffer del teclado: string que se edita con el numpad
    let buffer = total > 0 ? total.toFixed(2) : '';
    let fresh = true; // si true, la próxima tecla reemplaza el buffer

    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal modal-checkout" role="dialog" aria-modal="true" aria-labelledby="co-title">
          <div class="window-dots" aria-hidden="true">
            <span class="dot-cyan"></span>
            <span class="dot-cyan-light"></span>
            <span class="dot-white"></span>
          </div>
          <h2 id="co-title">Cobrar</h2>
          <div class="co-total">${money(total)}</div>
          <p class="muted small">${itemCount} artículo(s)</p>

          <div id="co-rows" class="stack"></div>
          <button type="button" class="btn btn-sm" id="co-add">+ Dividir pago / otro método</button>

          <!-- Teclado: display = cambio / falta (el monto ya está arriba y en la fila) -->
          <div class="numpad" id="numpad" aria-label="Teclado numérico">
            <div class="numpad-display co-change-display" id="numpad-display" role="status">
              <span class="co-change-label">Cambio</span>
              <span class="co-change-value" id="co-change-value">$0.00</span>
            </div>
            <div class="numpad-quick" id="numpad-quick"></div>
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
              <button type="button" class="num-key num-key-exact" data-k="exact">Exacto</button>
              <button type="button" class="num-key num-key-ok" data-k="ok">OK</button>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn" id="co-cancel">Cancelar</button>
            <button type="button" class="btn btn-primary" id="co-ok">Confirmar y guardar venta</button>
          </div>
        </div>
      </div>`;

    const $ = (sel) => root.querySelector(sel);

    const current = () => validatePayments(total, rows.map((r) => ({
      method: methods[r.m].label, cash: methods[r.m].cash, amount: r.amount === '' ? 0 : Number(r.amount)
    })));

    function syncBufferFromRow() {
      buffer = rows[activeRow]?.amount ?? '';
      fresh = true;
      updateChangeDisplay();
    }

    function applyBufferToRow() {
      if (activeRow < 0 || activeRow >= rows.length) return;
      rows[activeRow].amount = buffer;
      // refresca el input visible de esa fila
      const input = root.querySelector(`.co-row[data-i="${activeRow}"] input`);
      if (input) input.value = buffer;
      updateChangeDisplay();
    }

    /** Display principal: cambio a entregar, falta, o exacto (el monto ya se ve arriba). */
    function updateChangeDisplay() {
      const res = current();
      const box = $('#numpad-display');
      const val = $('#co-change-value');
      if (!box || !val) return;

      box.classList.remove('is-change', 'is-lack', 'is-exact', 'is-error');

      if (total === 0) {
        box.querySelector('.co-change-label').textContent = 'Total';
        val.textContent = money(0);
        box.classList.add('is-exact');
      } else if (!res.ok && res.remaining > 0) {
        box.querySelector('.co-change-label').textContent = 'Falta';
        val.textContent = money(res.remaining);
        box.classList.add('is-lack');
      } else if (!res.ok) {
        box.querySelector('.co-change-label').textContent = 'Revisa';
        val.textContent = res.error || '—';
        box.classList.add('is-error');
      } else if (res.change > 0) {
        box.querySelector('.co-change-label').textContent = 'Cambio a entregar';
        val.textContent = money(res.change);
        box.classList.add('is-change');
      } else {
        box.querySelector('.co-change-label').textContent = 'Pago exacto';
        val.textContent = money(0);
        box.classList.add('is-exact');
      }

      $('#co-ok').disabled = !res.ok;
    }

    function drawQuickCash() {
      const host = $('#numpad-quick');
      if (!host) return;
      const exactBtn = `<button type="button" class="num-quick" data-amount="${total}">${money(total)}</button>`;
      const extras = QUICK_CASH
        .filter((v) => v >= total)
        .slice(0, 5)
        .map((v) => `<button type="button" class="num-quick" data-amount="${v}">$${v}</button>`)
        .join('');
      host.innerHTML = exactBtn + extras;
    }

    function drawRows() {
      $('#co-rows').innerHTML = total === 0 ? '' : rows.map((r, i) => `
        <div class="co-row ${i === activeRow ? 'is-active' : ''}" data-i="${i}">
          <select class="input" aria-label="Método de pago">${methods.map((m, k) =>
            `<option value="${k}" ${k === r.m ? 'selected' : ''}>${escapeHtml(m.label)}</option>`
          ).join('')}</select>
          <input class="input co-amount" type="text" inputmode="decimal" aria-label="Monto" value="${escapeHtml(r.amount)}" readonly>
          ${rows.length > 1 ? '<button type="button" class="btn btn-sm" data-remove aria-label="Quitar pago">✕</button>' : ''}
        </div>`).join('');
      $('#co-add').hidden = total === 0;
      drawQuickCash();
      updateChangeDisplay();
    }

    function pressKey(k) {
      if (total === 0) return;

      if (k === 'ok') {
        applyBufferToRow();
        const res = current();
        if (res.ok) {
          close(res.payments.map((p) => ({ method: p.method, cash: p.cash, amount: Number(p.amount) })));
        }
        return;
      }
      if (k === 'exact') {
        buffer = total.toFixed(2);
        fresh = true;
        applyBufferToRow();
        updateChangeDisplay();
        return;
      }
      if (k === 'clear') {
        buffer = '';
        fresh = true;
        applyBufferToRow();
        updateChangeDisplay();
        return;
      }
      if (k === 'back') {
        if (fresh) { buffer = ''; fresh = false; }
        else buffer = buffer.slice(0, -1);
        applyBufferToRow();
        updateChangeDisplay();
        return;
      }
      if (k === '.') {
        if (fresh) { buffer = '0.'; fresh = false; }
        else if (!buffer.includes('.')) buffer += '.';
        applyBufferToRow();
        updateChangeDisplay();
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
        applyBufferToRow();
        updateChangeDisplay();
        return;
      }
      // dígito 0-9
      if (/^\d$/.test(k)) {
        if (fresh) { buffer = k === '0' ? '0' : k; fresh = false; }
        else {
          const parts = buffer.split('.');
          if (parts[1] !== undefined && parts[1].length >= 2) return; // máx 2 decimales
          if (buffer === '0' && k !== '.') buffer = k;
          else buffer += k;
        }
        applyBufferToRow();
        updateChangeDisplay();
      }
    }

    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      root.innerHTML = '';
      previous?.focus?.();
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
      if (e.key === 'Enter') { e.preventDefault(); pressKey('ok'); return; }
      if (e.key === 'Backspace') { e.preventDefault(); pressKey('back'); return; }
      if (e.key === 'Delete') { e.preventDefault(); pressKey('clear'); return; }
      if (e.key === '.') { e.preventDefault(); pressKey('.'); return; }
      if (/^\d$/.test(e.key)) { e.preventDefault(); pressKey(e.key); return; }
    };
    document.addEventListener('keydown', onKey);

    // Filas: cambiar método / activar fila para el teclado
    // Importante: NO re-dibujar al tocar el <select> (el redibujado cierra el menú nativo).
    $('#co-rows').addEventListener('change', (e) => {
      if (e.target.tagName !== 'SELECT') return;
      const row = e.target.closest('.co-row');
      if (!row) return;
      const i = Number(row.dataset.i);
      rows[i].m = Number(e.target.value);
      activeRow = i;
      buffer = rows[i].amount ?? '';
      fresh = true;
      root.querySelectorAll('.co-row').forEach((el) => {
        el.classList.toggle('is-active', el === row);
      });
      updateChangeDisplay();
    });
    $('#co-rows').addEventListener('click', (e) => {
      const row = e.target.closest('.co-row');
      if (!row) return;
      if (e.target.closest('[data-remove]')) {
        rows.splice(Number(row.dataset.i), 1);
        activeRow = Math.min(activeRow, rows.length - 1);
        if (activeRow < 0) activeRow = 0;
        syncBufferFromRow();
        drawRows();
        return;
      }
      // Clic en el select: solo marcar fila activa, sin innerHTML (si no, el desplegable no abre)
      if (e.target.tagName === 'SELECT' || e.target.closest('select')) {
        activeRow = Number(row.dataset.i);
        buffer = rows[activeRow]?.amount ?? '';
        fresh = true;
        root.querySelectorAll('.co-row').forEach((el) => {
          el.classList.toggle('is-active', el === row);
        });
        return;
      }
      const next = Number(row.dataset.i);
      if (next === activeRow) return; // ya activa: no re-render
      activeRow = next;
      syncBufferFromRow();
      drawRows();
    });

    $('#co-add').addEventListener('click', () => {
      applyBufferToRow();
      const res = current();
      rows.push({ m: Math.min(1, methods.length - 1), amount: res.remaining > 0 ? res.remaining.toFixed(2) : '' });
      activeRow = rows.length - 1;
      syncBufferFromRow();
      drawRows();
    });

    // Teclado
    $('#numpad').addEventListener('click', (e) => {
      const key = e.target.closest('[data-k]')?.dataset.k;
      if (key) pressKey(key);
      const amt = e.target.closest('[data-amount]')?.dataset.amount;
      if (amt !== undefined) {
        buffer = Number(amt).toFixed(2);
        fresh = true;
        applyBufferToRow();
        updateChangeDisplay();
      }
    });

    $('#co-cancel').addEventListener('click', () => close(null));
    $('#co-ok').addEventListener('click', () => {
      applyBufferToRow();
      const res = current();
      if (res.ok) close(res.payments.map((p) => ({ method: p.method, cash: p.cash, amount: Number(p.amount) })));
    });

    drawRows();
    // focus visual en el display del teclado
    $('#numpad-display')?.focus?.();
  });
}
