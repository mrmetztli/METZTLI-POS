# Modelo comercial multiempresa — METZTLI Caja

## Decisión aprobada

METZTLI Caja se comercializará como una plataforma multiempresa (multi-tenant). Se admiten dos vías de alta de clientes: autorregistro y alta/invitación administrada por METZTLI. Cada negocio tiene un propietario y puede invitar a su propio equipo.

## Actores y límites de confianza

- **Administrador de plataforma (METZTLI):** administra altas comerciales, licencias, planes y soporte. Su privilegio vive en `platform_admins` y en funciones/Edge Functions del servidor; no es un rol de negocio ni se concede a los propietarios.
- **Cliente/propietario:** puede crear un negocio mediante registro o aceptar una invitación de METZTLI. Es el único rol que puede invitar administradores del negocio y retirar miembros.
- **Administrador del negocio:** administra la operación e invita cajeros/lectores; no puede crear propietarios ni administrar licencias de plataforma.
- **Cajero:** registra operaciones permitidas; no cambia configuración protegida ni gestiona miembros.
- **Lector:** consulta información permitida, sin escribir.

## Flujo de registro y alta administrada

1. Autorregistro: la persona crea una cuenta en Supabase Auth, verifica su correo y completa el nombre del negocio.
2. La app llama a `create_business(p_name)`; la función crea el negocio, agrega al usuario como `owner` y crea una suscripción inicial en estado `pending`.
3. Alta METZTLI: un administrador de plataforma usa un panel/Edge Function protegida para invitar al correo del cliente. El cliente acepta el correo, configura su cuenta y completa el alta del negocio o acepta la invitación de propietario emitida por servidor.
4. La activación, suspensión, plan y vigencia de la licencia se administran desde servidor. No se confía en valores enviados por la app.

## Invitación de empleados y cajeros

1. El propietario (y, si el negocio lo habilita, un administrador) captura el correo y rol.
2. Una Supabase Edge Function valida la sesión, la membresía y el permiso del solicitante.
3. La Edge Function usa la clave `service_role` únicamente en el entorno servidor para enviar la invitación de Auth y registrar la invitación. La clave jamás se incluye en APK, EXE, JS o repositorio.
4. El invitado crea/inicia sesión con el mismo correo y acepta la invitación. `accept_business_invitation` compara el correo autenticado, valida vencimiento/uso y crea la membresía.
5. El propietario puede revocar el acceso. La revocación debe invalidar también sesiones/dispositivos y forzar nueva comprobación de membresía antes de operaciones sincronizadas.

No se permite agregar miembros mediante un UUID arbitrario introducido desde el cliente. La función anterior `add_business_member` queda revocada para clientes.

## Aislamiento multiempresa

- Cada fila de negocio y cada dato sincronizado llevan `business_id`.
- Todas las tablas, vistas, RPC y canales Realtime deben verificar membresía con `auth.uid()` y RLS.
- El cliente nunca decide la autorización: cualquier `business_id` recibido se valida contra la membresía activa del usuario.
- Un usuario puede pertenecer a varios negocios; la app debe permitir elegir el negocio activo y cambiarlo sin mezclar cachés.
- Las pruebas deben incluir dos negocios y usuarios cruzados, además de roles owner/admin/cashier/viewer.
- Los datos locales se particionan por negocio; al cambiar de negocio no se reutiliza el conjunto local del anterior.

## Varios dispositivos y operación offline

Cada instalación registra su propio dispositivo. Un usuario puede iniciar sesión en varios Android y PC. IndexedDB sigue siendo la caché local y la cola de salida. Al recuperar internet, la sincronización verifica sesión, membresía, negocio activo, permisos y revisiones antes de aplicar operaciones.

Las ventas, folios e inventario no se resuelven con last-write-wins: requieren IDs idempotentes, folios asignados atómicamente y movimientos de stock transaccionales en servidor. Una revocación de empleado debe impedir nuevas operaciones remotas; las operaciones offline pendientes se ponen en cuarentena hasta validar permisos, nunca se suben a otro negocio.

## Licencias y administrador de plataforma

La tabla `business_subscriptions` representa plan/estado/vigencia, pero solo el servidor puede leer o modificarla. El administrador de plataforma se registra explícitamente en `platform_admins`; no se deduce del correo ni del rol owner. Las funciones comerciales (invitar cliente, activar/suspender licencia, cambiar plan) deben ejecutarse en Edge Functions que validen dicho rol.

## Orden de implementación de PR

1. **PR #2 (base de datos):** incorporar la migración comercial, revocar el alta de miembros por UUID y documentar RLS/aislamiento. Sigue sin estar listo para producción hasta pruebas SQL/RLS.
2. **PR #3 (cliente Auth):** retirar el BUSINESS_ID/BUSINESS_NAME fijo; implementar registro/inicio de sesión, consulta de membresías y selección de negocio. No se debe fusionar en su forma actual.
3. **Siguiente PR de invitaciones:** Edge Functions para alta administrada por METZTLI e invitaciones de empleados, aceptación, revocación, y administración de licencias. Secretos solo en Supabase Functions Secrets.
4. **Sincronización:** outbox offline particionada por negocio, idempotencia, movimientos de inventario y folios atómicos.
5. **Validación:** pruebas de aislamiento entre negocios, roles, invitaciones vencidas/reutilizadas, revocaciones, cambio de negocio, offline/reconexión y varios dispositivos.

## Migración y seguridad

- No ejecutar esta migración encima del proyecto Supabase actual hasta revisar el SQL completo y definir el estado del negocio bootstrap existente.
- No eliminar ni importar automáticamente datos IndexedDB.
- No desinstalar la APK existente; futuras actualizaciones deben instalarse encima.
- Nunca solicitar ni guardar la contraseña del usuario ni la clave service_role en el cliente.
- Antes de producción: pruebas automatizadas RLS, revisión de grants, Edge Functions, Auth redirect URLs, límites de registro y políticas de licencia.
