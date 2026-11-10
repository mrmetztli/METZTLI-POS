// utilities.js — funciones pequeñas que usan todos los módulos.
import { getConfig } from './state.js';

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function money(amount) {
  const currency = getConfig()?.currency || 'MXN';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(Number(amount) || 0);
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium', timeZone: getConfig()?.timezone || 'America/Mexico_City'
  }).format(new Date(iso));
}

// Un día contable "AAAA-MM-DD" (como la fecha de un gasto) en formato dd/mm/aaaa, sin convertir zonas horarias.
export const formatDay = (key) => (/^\d{4}-\d{2}-\d{2}$/.test(String(key)) ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '');

export function formatDateTime(iso) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: getConfig()?.timezone || 'America/Mexico_City'
  }).format(new Date(iso));
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Descarga un archivo de texto (respaldos, CSV…)
export function download(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Reduce una imagen a máx. 320 px y la devuelve como texto (data URL) para guardarla en IndexedDB.
export function imageToDataURL(file, max = 320, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Elige un archivo de imagen.'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('La imagen pesa más de 10 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

// Reduce una imagen (máx. 480 px) y la devuelve como texto, para no llenar el almacenamiento.
export function resizeImage(file, max = 480, { png = false } = {}) { // png: conserva la transparencia (logotipos)
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('El archivo no es una imagen.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!png) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}
