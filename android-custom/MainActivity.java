package mx.metztli.caja;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;

public class MainActivity extends BridgeActivity {
    private DownloadManager downloadManager;
    private volatile long activeDownloadId = -1;
    private volatile String expectedSha256 = "";
    private BroadcastReceiver downloadReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        downloadManager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        bridge.getWebView().addJavascriptInterface(new ApkInstallerBridge(), "MetztliApkInstaller");

        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != activeDownloadId) return;
                handleDownloadComplete(id);
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(downloadReceiver, filter);
        }
    }

    @Override
    public void onDestroy() {
        if (downloadReceiver != null) {
            try { unregisterReceiver(downloadReceiver); } catch (IllegalArgumentException ignored) { }
        }
        super.onDestroy();
    }

    private class ApkInstallerBridge {
        @JavascriptInterface
        public boolean downloadAndInstall(String url, String fileName, String digest) {
            Uri parsed = Uri.parse(url == null ? "" : url);
            if (!"https".equalsIgnoreCase(parsed.getScheme()) ||
                !"github.com".equalsIgnoreCase(parsed.getHost()) ||
                parsed.getPath() == null ||
                !parsed.getPath().startsWith("/mrmetztli/METZTLI-POS/releases/download/") ||
                fileName == null ||
                !fileName.matches("METZTLI-Caja-v[0-9]+(\\.[0-9]+)*\\.apk")) {
                showToast("Enlace de actualización no permitido.");
                return false;
            }

            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                runOnUiThread(() -> {
                    showToast("Permite a METZTLI Caja instalar aplicaciones y vuelve a pulsar Actualizar.");
                    Intent settingsIntent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())
                    );
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(settingsIntent);
                });
                return false;
            }

            try {
                expectedSha256 = digest == null ? "" : digest.replaceFirst("(?i)^sha256:", "").trim().toLowerCase();
                DownloadManager.Request request = new DownloadManager.Request(parsed);
                request.setTitle("Actualización de METZTLI Caja");
                request.setDescription("Descargando " + fileName);
                request.setMimeType("application/vnd.android.package-archive");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(false);
                request.setDestinationInExternalFilesDir(MainActivity.this, Environment.DIRECTORY_DOWNLOADS, fileName);
                activeDownloadId = downloadManager.enqueue(request);
                return true;
            } catch (Exception error) {
                showToast("No se pudo iniciar la descarga.");
                return false;
            }
        }
    }

    private void handleDownloadComplete(long id) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        try (Cursor cursor = downloadManager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                showToast("No se pudo verificar la descarga del APK.");
                return;
            }
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0 || cursor.getInt(statusIndex) != DownloadManager.STATUS_SUCCESSFUL) {
                showToast("La descarga del APK no terminó correctamente.");
                return;
            }
        } catch (Exception error) {
            showToast("No se pudo comprobar la descarga.");
            return;
        }

        Uri apkUri = downloadManager.getUriForDownloadedFile(id);
        if (apkUri == null) {
            showToast("Android no encontró el APK descargado.");
            return;
        }
        if (!verifySha256(id, expectedSha256)) {
            showToast("La verificación de seguridad del APK falló. No se instalará.");
            return;
        }

        try {
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(installIntent);
        } catch (Exception error) {
            showToast("No se pudo abrir el instalador de Android.");
        }
    }

    private boolean verifySha256(long id, String expected) {
        if (expected == null || expected.isEmpty()) return true;
        try (ParcelFileDescriptor descriptor = downloadManager.openDownloadedFile(id);
             InputStream input = new FileInputStream(descriptor.getFileDescriptor())) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
            StringBuilder actual = new StringBuilder();
            for (byte value : digest.digest()) actual.append(String.format("%02x", value));
            return expected.equalsIgnoreCase(actual.toString());
        } catch (Exception error) {
            return false;
        }
    }

    private void showToast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }
}
