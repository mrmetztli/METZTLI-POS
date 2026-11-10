// app.js — punto de entrada: abre el almacenamiento, carga la configuración y arranca la navegación.
import * as state from './state.js';
import { startRouter } from './router.js';
import { escapeHtml } from './utilities.js';

async function main() {
  try {
    await state.init();
  } catch (err) {
    console.error(err);
    document.getElementById('view').innerHTML = `
      <div class="card"><h2>No se pudo abrir el almacenamiento</h2>
      <p class="muted">${escapeHtml(err.message)}</p>
      <p class="muted">Revisa que no estés en una ventana privada y que el navegador permita guardar datos.</p></div>`;
    return;
  }
  startRouter();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado:', e));
  }
}

main();
