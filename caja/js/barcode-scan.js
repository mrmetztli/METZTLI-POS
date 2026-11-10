// barcode-scan.js — escáner de códigos de barras con la cámara del dispositivo.
// Usa BarcodeDetector (Chrome / Android / Edge). Si no está disponible, ofrece
// entrada manual y un aviso claro.
import { escapeHtml } from './utilities.js';

const FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'codabar',
  'qr_code', 'itf'
];

/**
 * Abre un modal con la cámara y resuelve con el texto del código, o null si cancela.
 * @param {{ title?: string, hint?: string }} opts
 * @returns {Promise<string|null>}
 */
export function openBarcodeScanner(opts = {}) {
  const title = opts.title || 'Escanear código de barras';
  const hint = opts.hint || 'Apunta al código. Se detecta solo al enfocar.';

  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const previous = document.activeElement;
    const supported = typeof window.BarcodeDetector === 'function';

    root.innerHTML = `
      <div class="modal-backdrop scan-backdrop">
        <div class="modal modal-scan" role="dialog" aria-modal="true" aria-labelledby="scan-title">
          <div class="window-dots" aria-hidden="true">
            <span class="dot-cyan"></span>
            <span class="dot-cyan-light"></span>
            <span class="dot-white"></span>
          </div>
          <h2 id="scan-title">${escapeHtml(title)}</h2>
          <p class="muted small" id="scan-hint">${escapeHtml(hint)}</p>
          <div class="scan-stage">
            <video id="scan-video" playsinline muted autoplay></video>
            <div class="scan-frame" aria-hidden="true"></div>
            <div class="scan-status" id="scan-status">${supported ? 'Buscando código…' : 'Cámara lista · detección automática no disponible en este navegador'}</div>
          </div>
          <div class="field">
            <label for="scan-manual">O escribe el código</label>
            <div class="row" style="gap:8px">
              <input id="scan-manual" class="input" inputmode="numeric" autocomplete="off" placeholder="Código de barras">
              <button type="button" class="btn btn-primary" id="scan-manual-ok">Usar</button>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" id="scan-cancel">Cancelar</button>
          </div>
        </div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const video = $('#scan-video');
    const status = $('#scan-status');
    let stream = null;
    let detector = null;
    let raf = 0;
    let closed = false;
    let lastCode = '';
    let lastAt = 0;

    const close = (value) => {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      document.removeEventListener('keydown', onKey);
      root.innerHTML = '';
      previous?.focus?.();
      resolve(value);
    };

    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);

    $('#scan-cancel').addEventListener('click', () => close(null));
    root.querySelector('.scan-backdrop').addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('scan-backdrop')) close(null);
    });

    const accept = (code) => {
      const text = String(code || '').trim();
      if (!text) return;
      // Evita lecturas duplicadas en ráfaga
      const now = Date.now();
      if (text === lastCode && now - lastAt < 1200) return;
      lastCode = text;
      lastAt = now;
      status.textContent = `✓ ${text}`;
      status.classList.add('is-ok');
      // Pequeña pausa para feedback visual
      setTimeout(() => close(text), 280);
    };

    $('#scan-manual-ok').addEventListener('click', () => {
      accept($('#scan-manual').value);
    });
    $('#scan-manual').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        accept(e.target.value);
      }
    });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        video.srcObject = stream;
        await video.play();
      } catch (err) {
        status.textContent = 'No se pudo abrir la cámara. Revisa los permisos o escribe el código abajo.';
        status.classList.add('is-err');
        $('#scan-manual').focus();
        return;
      }

      if (!supported) {
        status.textContent = 'Tu navegador no detecta códigos solo. Escribe el código o usa Chrome/Edge en Android.';
        return;
      }

      try {
        detector = new window.BarcodeDetector({ formats: FORMATS });
      } catch {
        detector = new window.BarcodeDetector();
      }

      const tick = async () => {
        if (closed) return;
        if (video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (codes && codes.length) {
              const raw = String(codes[0].rawValue ?? '').trim();
              if (raw) accept(raw);
            }
          } catch {
            // frame fallido: seguir
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    start();
  });
}

/** true si el dispositivo puede intentar escanear con cámara. */
export function canUseCameraScan() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
