// Actualizaciones de METZTLI Caja: consulta GitHub Releases y solicita la instalación nativa.
import { openModal, toast } from './components.js';

const RELEASE_API = 'https://api.github.com/repos/mrmetztli/METZTLI-POS/releases/latest';
const LAST_CHECK_KEY = 'metztli.update.lastCheck';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export async function getInstalledVersion() {
  try {
    const response = await fetch(new URL('../version.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo leer version.json');
    const data = await response.json();
    return String(data.version || '1.2.2');
  } catch {
    return '1.2.2';
  }
}

function compareVersions(a, b) {
  const left = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const right = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] || 0;
    const y = right[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export async function checkForUpdate({ force = false } = {}) {
  const now = Date.now();
  if (!force) {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
    if (last && now - last < CHECK_INTERVAL) {
      return { available: false, skipped: true, message: 'La comprobación automática se realizó recientemente.' };
    }
  }
  localStorage.setItem(LAST_CHECK_KEY, String(now));

  const response = await fetch(RELEASE_API, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (response.status === 404) {
    return { available: false, message: 'Todavía no hay una versión publicada en GitHub Releases.' };
  }
  if (!response.ok) throw new Error('GitHub respondió con el código ' + response.status + '.');
  const release = await response.json();
  const version = String(release.tag_name || '').replace(/^v/i, '');
  const currentVersion = await getInstalledVersion();

  if (!version || compareVersions(version, currentVersion) <= 0) {
    return { available: false, currentVersion, message: 'METZTLI Caja está actualizada (v' + currentVersion + ').' };
  }

  const assetName = 'METZTLI-Caja-v' + version + '.apk';
  const asset = (release.assets || []).find((item) => item.name === assetName);
  if (!asset || !asset.browser_download_url) {
    throw new Error('La publicación ' + release.tag_name + ' no contiene el APK esperado (' + assetName + ').');
  }

  return {
    available: true,
    version,
    currentVersion,
    url: asset.browser_download_url,
    assetName,
    digest: asset.digest || '',
    notes: String(release.body || 'Mejoras y correcciones generales.').slice(0, 1200)
  };
}

export function downloadUpdate(release) {
  if (!release || !release.url || !release.assetName) {
    toast('No se encontró el archivo de actualización.', 'error');
    return false;
  }
  let url;
  try { url = new URL(release.url); } catch {
    toast('El enlace de actualización no es válido.', 'error');
    return false;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' ||
      !url.pathname.startsWith('/mrmetztli/METZTLI-POS/releases/download/')) {
    toast('Por seguridad, solo se permiten APK publicados en el repositorio oficial.', 'error');
    return false;
  }

  const bridge = window.MetztliApkInstaller;
  if (bridge && typeof bridge.downloadAndInstall === 'function') {
    const started = bridge.downloadAndInstall(url.href, release.assetName, release.digest || '');
    if (started) toast('Descarga iniciada. Android abrirá el instalador al terminar.', 'ok');
    else toast('Activa el permiso para instalar aplicaciones desde METZTLI Caja y vuelve a pulsar Actualizar.', 'error');
    return Boolean(started);
  }

  const link = document.createElement('a');
  link.href = url.href;
  link.download = release.assetName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast('Se abrió la descarga del APK.', 'ok');
  return true;
}

export function startAutomaticUpdateCheck() {
  window.setTimeout(async () => {
    try {
      const result = await checkForUpdate();
      if (!result.available) return;
      const choice = await openModal({
        title: 'Nueva versión disponible: v' + result.version,
        message: 'Tienes instalada la versión v' + result.currentVersion + '. ' + result.notes,
        actions: [
          { label: 'Más tarde', value: 'later' },
          { label: 'Actualizar ahora', value: 'update', kind: 'primary' }
        ]
      });
      if (choice === 'update') downloadUpdate(result);
    } catch (error) {
      console.info('No se pudo comprobar si hay actualizaciones:', error);
    }
  }, 2500);
}
