// settings-data.js — almacenamiento, respaldo, restauración y datos de prueba.
// Regla: nunca se sobrescribe nada sin avisar. Restaurar exige escribir RESTAURAR y deja una copia para deshacer.
import * as db from './database.js';
import { parseBackup, restoreBackup, undoRestore, hasRestorePoint } from './backup.js';
import { hasDemo, loadDemo, removeDemo } from './demo-data.js';
import { toast, confirmDialog, promptDialog, openModal } from './components.js';
import { escapeHtml, formatDateTime, download } from './utilities.js';

const COUNT_LABELS = { products: 'Productos y servicios', categories: 'Categorías', sales: 'Ventas', expenses: 'Gastos' };

async function currentCounts() {
  const out = {};
  for (const k of Object.keys(COUNT_LABELS)) out[k] = await db.count(k);
  return out;
}

const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);

export function render(host) {
  host.innerHTML = `
    <section class="section"><h2>Estado de los datos</h2>
      <div class="notice warn">Tus datos se guardan solo en este navegador y dispositivo. No existe respaldo automático ni en la nube:
        si borras los datos del navegador, se pierden. Exporta una copia con frecuencia.</div>
      <div class="card stack">
        <dl class="kv" id="d-status"><dt>Cargando…</dt><dd></dd></dl>
        <p class="notice" id="d-backup-note" hidden></p>
        <div class="row">
          <button class="btn btn-primary" id="d-export" type="button">Exportar respaldo</button>
          <button class="btn" id="d-persist" type="button" hidden>Proteger datos del borrado automático</button>
        </div>
      </div></section>
    <section class="section"><h2>Restaurar desde un respaldo</h2>
      <div class="card stack">
        <p class="muted small">Elige un archivo .json exportado desde esta app. Primero se revisa; no se cambia nada hasta que lo confirmes.</p>
        <input id="d-file" type="file" accept=".json,application/json" aria-label="Elegir archivo de respaldo">
        <div id="d-import"></div>
        <div id="d-undo"></div>
      </div></section>
    <section class="section"><h2>Datos de prueba</h2>
      <div class="card stack"><div id="d-demo"></div></div></section>`;
  const $ = (s) => host.querySelector(s);

  async function loadStatus() {
    const box = $('#d-status');
    try {
      const counts = await currentCounts();
      const rows = Object.entries(COUNT_LABELS).map(([k, l]) => [l, String(counts[k])]);
      const last = await db.get('meta', 'lastBackup');
      rows.push(['Último respaldo', last ? formatDateTime(last.value) : 'Nunca']);
      let persisted = null;
      if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
      if (persisted !== null) rows.push(['Protección del navegador', persisted ? 'Activada' : 'No activada']);
      if (navigator.storage?.estimate) rows.push(['Espacio usado', `${(((await navigator.storage.estimate()).usage || 0) / 1024).toFixed(0)} KB`]);
      box.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
      $('#d-persist').hidden = persisted !== false;
      const note = $('#d-backup-note');
      if (counts.sales > 0 && (!last || daysSince(last.value) >= 7)) {
        note.textContent = last ? `Tu último respaldo fue hace ${daysSince(last.value)} días. Conviene exportar uno nuevo.` : 'Todavía no has exportado ningún respaldo y ya tienes ventas registradas.';
        note.hidden = false;
      } else note.hidden = true;
    } catch (err) {
      box.innerHTML = `<dt>Error al leer el almacenamiento</dt><dd>${escapeHtml(err.message)}</dd>`;
    }
  }

  $('#d-export').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; // evita doble clic
    try {
      const backup = await db.exportAll();
      download(`respaldo-caja-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
      await db.put('meta', { id: 'lastBackup', value: new Date().toISOString() });
      toast('Respaldo exportado', 'ok');
      loadStatus();
    } catch (err) { toast('No se pudo exportar: ' + err.message, 'error'); } finally { btn.disabled = false; }
  });
  $('#d-persist').addEventListener('click', async () => {
    const granted = await navigator.storage.persist();
    toast(granted ? 'Protección activada' : 'El navegador no la concedió', granted ? 'ok' : 'error');
    loadStatus();
  });

  /* ---- Importar y restaurar ---- */
  $('#d-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const box = $('#d-import');
    box.innerHTML = '';
    if (!file) return;
    let result;
    try { result = parseBackup(await file.text(), file.size); } catch { result = { ok: false, errors: ['No se pudo leer el archivo.'] }; }
    if (!result.ok) {
      box.innerHTML = `<div class="notice warn" role="alert"><strong>Este archivo no se puede usar. No se cambió nada.</strong>
        <ul>${result.errors.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div>`;
      return;
    }
    const now = await currentCounts();
    const c = result.summary.counts;
    box.innerHTML = `<div class="notice" role="status"><strong>Respaldo válido${result.summary.exportedAt ? ` · exportado el ${escapeHtml(formatDateTime(result.summary.exportedAt))}` : ''}</strong>
      <dl class="kv" style="margin-top:8px">
        ${Object.entries(COUNT_LABELS).map(([k, l]) => `<dt>${l}</dt><dd>${c[k]} <span class="muted small">(ahora: ${now[k]})</span></dd>`).join('')}
      </dl></div>
      <div class="notice warn">Restaurar <strong>reemplazará todos los datos actuales</strong> por los de este archivo. Antes se guarda una copia automática para poder deshacerlo.</div>
      <div><button class="btn btn-danger" id="d-restore" type="button">Restaurar este respaldo…</button></div>`;
    box.querySelector('#d-restore').addEventListener('click', async (ev) => {
      const typed = await promptDialog({
        title: 'Restaurar respaldo',
        message: `Se reemplazarán TODOS los datos actuales (${now.sales} ventas, ${now.expenses} gastos, ${now.products} productos) por los del respaldo. Para continuar, escribe RESTAURAR.`,
        label: 'Escribe RESTAURAR', confirmText: 'Restaurar', danger: true,
        validate: (v) => (v.trim().toUpperCase() === 'RESTAURAR' ? '' : 'Escribe la palabra RESTAURAR para continuar.')
      });
      if (typed === null) return;
      ev.currentTarget.disabled = true;
      try {
        await restoreBackup(result.backup);
        toast('Respaldo restaurado. Recargando…', 'ok');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        ev.currentTarget.disabled = false;
        await openModal({ title: 'No se pudo restaurar', message: err.message + ' Tus datos actuales no se modificaron.' });
      }
    });
  });

  async function loadUndo() {
    const point = await hasRestorePoint();
    $('#d-undo').innerHTML = point
      ? `<div class="notice"><strong>Hay una copia automática del ${escapeHtml(formatDateTime(point.at))}</strong> (justo antes de la última restauración).
          <div class="row" style="margin-top:8px"><button class="btn btn-sm" id="d-undo-btn" type="button">Deshacer la última restauración</button>
          <button class="btn btn-sm" id="d-undo-drop" type="button">Descartar la copia</button></div></div>` : '';
    $('#d-undo-btn')?.addEventListener('click', async () => {
      const yes = await confirmDialog({ title: '¿Deshacer la restauración?', message: 'Volverán los datos que tenías justo antes de restaurar el respaldo. Lo que hayas registrado después se perderá.', confirmText: 'Deshacer', danger: true });
      if (!yes) return;
      try { await undoRestore(); toast('Restauración deshecha. Recargando…', 'ok'); setTimeout(() => location.reload(), 700); } catch (err) { toast(err.message, 'error'); }
    });
    $('#d-undo-drop')?.addEventListener('click', async () => {
      const yes = await confirmDialog({ title: '¿Descartar la copia automática?', message: 'Ya no podrás deshacer la restauración. Libera espacio de almacenamiento.', confirmText: 'Descartar' });
      if (!yes) return;
      await db.remove('meta', 'preRestore');
      loadUndo(); loadStatus();
    });
  }

  /* ---- Datos de prueba ---- */
  async function loadDemoBox() {
    const box = $('#d-demo');
    const present = await hasDemo();
    box.innerHTML = `<p class="muted small">Sirven para ver cómo se ven el dashboard y los reportes. Están marcados como <strong>PRUEBA</strong>, no usan tus folios reales y se eliminan sin tocar tus datos.</p>
      ${present ? '<div class="notice warn">Hay datos de prueba cargados.</div>' : ''}
      <div><button class="btn ${present ? 'btn-danger' : ''}" id="d-demo-btn" type="button">${present ? 'Eliminar datos de prueba' : 'Cargar datos de prueba'}</button></div>`;
    box.querySelector('#d-demo-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        if (present) {
          const yes = await confirmDialog({ title: '¿Eliminar los datos de prueba?', message: 'Se borran los productos, categorías, ventas y gastos marcados como PRUEBA. Tus datos reales no se tocan.', confirmText: 'Eliminar', danger: true });
          if (!yes) { btn.disabled = false; return; }
          const r = await removeDemo();
          toast(`Eliminados: ${r.sales} ventas, ${r.expenses} gastos, ${r.products} productos${r.kept ? ` (${r.kept} se conservaron porque ya se usaron en ventas reales)` : ''}`, 'ok');
        } else {
          const yes = await confirmDialog({ title: '¿Cargar datos de prueba?', message: 'Se agregan 10 productos, 3 categorías, unas 50 ventas y unos 15 gastos de los últimos 45 días, todos marcados como PRUEBA. Puedes eliminarlos cuando quieras.', confirmText: 'Cargar' });
          if (!yes) { btn.disabled = false; return; }
          const r = await loadDemo();
          toast(`Cargados: ${r.sales} ventas, ${r.expenses} gastos y ${r.products} productos de prueba`, 'ok');
        }
      } catch (err) { toast(err.message, 'error'); }
      loadDemoBox(); loadStatus();
    });
  }

  loadStatus(); loadUndo(); loadDemoBox();
}
