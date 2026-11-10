# Firma y publicación de METZTLI Caja para Android

## 1. Crear una clave de firma permanente (Windows)

Instala un JDK 17 si todavía no tienes `keytool`. Abre PowerShell en una carpeta privada de tu PC y ejecuta:

```powershell
keytool -genkeypair -v -keystore metztli-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias metztli-release
```

- Define una contraseña segura para el almacén y otra para la clave (pueden ser iguales).
- Guarda `metztli-release.jks` en dos respaldos seguros fuera del repositorio.
- **No subas el archivo JKS ni las contraseñas a GitHub, ni las compartas por chat.**
- Si pierdes esta clave, no podrás firmar actualizaciones compatibles con las versiones publicadas con ella.

Para copiar el JKS codificado en Base64 al portapapeles de Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\metztli-release.jks")) | Set-Clipboard
```

## 2. Añadir los secretos en GitHub

Abre el repositorio METZTLI-POS → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Crea estos cuatro secretos:

| Nombre exacto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Contenido Base64 copiado en el paso anterior |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del almacén |
| `ANDROID_KEY_ALIAS` | `metztli-release` |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave |

No escribas los valores en archivos del repositorio. GitHub los inyecta al compilar.

## 3. Versionado de cada actualización

- Cambia `version` en `package.json` (por ejemplo, `1.2.1`).
- Aumenta `android-version-code.txt` en **al menos 1** (por ejemplo, de `2` a `3`).
- Haz commit y push a `main`. El workflow compila un APK Release firmado y lo guarda como artefacto de Actions.
- Para crear una publicación: crea y sube una etiqueta Git que comience con `v` y corresponda a la versión, por ejemplo `v1.2.1`. El workflow adjunta el APK a un GitHub Release.

El `versionCode` debe ser siempre mayor que el de cualquier APK que quieras actualizar. Nunca lo reduzcas ni lo reutilices.

## 4. Datos de la aplicación

Se conserva el identificador Android `mx.metztli.caja`. Para que Android acepte una actualización, conserva ese identificador y firma todas las versiones futuras con **el mismo JKS**. Una actualización instalada encima normalmente conserva los datos locales de la aplicación.

Desinstalar la aplicación, borrar sus datos o cambiar el identificador puede eliminar o dejar inaccesibles los datos locales. Haz respaldos periódicos desde la propia aplicación si contiene información importante.

## 5. Primera compilación

Después de configurar los cuatro secretos, entra en **Actions** → **Generar APK firmado - METZTLI Caja** → **Run workflow**. Si falla, abre el trabajo y revisa el primer paso marcado en rojo.

La clave se crea y resguarda en tu PC; el workflow solo la usa temporalmente durante la compilación y no la publica como artefacto.
