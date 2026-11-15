# Acceso comercial multiempresa — METZTLI Caja

## Alcance de esta fase

- Registro de cuenta por correo y contraseña.
- Inicio/cierre de sesión con Supabase Auth.
- Creación de negocio mediante `create_business`; el creador queda como owner.
- Consulta de todas las membresías y selección del negocio activo.
- Registro independiente de cada instalación en `sync_devices`.
- Invitación de empleados mediante Edge Function (owner/admin según rol).
- Alta administrada por METZTLI mediante Edge Function exclusiva para platform admins.

Esta fase no sincroniza ventas, inventario ni otros registros y no importa datos de IndexedDB.

## Configuración

1. Aplicar primero `supabase/schema.sql` y después `supabase/commercial-multitenant.sql`, solo tras revisión en un entorno de pruebas.
2. Configurar Auth → URL Configuration y habilitar confirmación de correo según la política comercial.
3. Desplegar las Edge Functions `business-invite-member` y `platform-invite-customer`.
4. Definir `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_ROLE_KEY` y `APP_SITE_URL` como secrets de Supabase Functions.
5. Registrar el primer administrador METZTLI insertando su UID en `platform_admins` desde un canal administrativo seguro.
6. No incluir la clave service role en la app, APK, EXE, variables públicas ni repositorio.

## Prueba manual

- Registrar una cuenta de prueba, confirmar correo si está habilitado e iniciar sesión.
- Crear dos negocios con usuarios distintos y verificar que cada usuario solo ve sus membresías.
- Invitar un cajero desde un negocio; aceptar invitación con el correo destinatario y verificar el rol.
- Comprobar que un admin no puede invitar otro admin y que un usuario no miembro no puede invitar a nadie.
- Probar revocación de membresía y comprobar que la sesión ya no puede acceder a datos del negocio.
- Iniciar sesión desde dos dispositivos y verificar dos registros independientes en sync_devices.

## Importante

La sincronización real sigue deshabilitada. No se limpia, migra ni sobrescribe IndexedDB. La selección de negocio solo establece contexto de acceso; la futura capa de sincronización debe particionar cachés/outbox por business_id y volver a validar membresía y permisos en servidor.
