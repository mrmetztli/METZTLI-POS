# Acceso comercial multiempresa — METZTLI Caja

## Alcance de esta fase

- Registro de cuenta por correo y contraseña.
- Inicio/cierre de sesión con Supabase Auth.
- Creación de negocio mediante `create_business`; el creador queda como owner.
- Consulta de todas las membresías y selección del negocio activo.
- Registro independiente de cada instalación en `sync_devices`.
- Invitación de empleados mediante Edge Function (owner/admin según rol).
- Aceptación de invitación después de iniciar sesión con el correo invitado.
- Detección segura del administrador de plataforma y envío de invitaciones a clientes METZTLI.

Esta fase no sincroniza ventas, inventario ni otros registros y no importa datos de IndexedDB.

## Configuración

1. Aplicar primero `supabase/schema.sql` y después `supabase/commercial-multitenant.sql`, solo tras revisión en un entorno de pruebas.
2. Configurar Auth → URL Configuration y habilitar confirmación de correo según la política comercial.
3. Configurar SMTP de Supabase para que las invitaciones lleguen a los destinatarios.
4. Desplegar `business-invite-member`, `platform-admin-status` y `platform-invite-customer` desde `supabase/functions`.
5. Configurar `APP_SITE_URL` en Edge Function secrets. Verificar que el runtime dispone de `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.
6. Registrar el primer administrador METZTLI insertando su UID en `platform_admins` desde un canal administrativo seguro.
7. No incluir la clave service role en la app, APK, EXE, variables públicas ni repositorio.

## Prueba manual

- Registrar una cuenta de prueba, confirmar correo si está habilitado e iniciar sesión.
- Crear dos negocios con usuarios distintos y verificar que cada usuario solo ve sus membresías.
- Invitar un cajero desde un negocio; aceptar invitación con el correo destinatario y verificar el rol.
- Probar invitación a una cuenta ya existente: compartir el enlace de aceptación y comprobar que solo el usuario del correo correcto puede aceptarlo.
- Comprobar que un admin no puede invitar otro admin y que un usuario no miembro no puede invitar a nadie.
- Iniciar sesión desde dos dispositivos y verificar dos registros independientes.
- Añadir un UID de prueba a `platform_admins`, comprobar que aparece el panel METZTLI y que puede invitar un cliente; retirar ese UID al terminar la prueba.

## Importante

La sincronización real sigue deshabilitada. No se limpia, migra ni sobrescribe IndexedDB. La selección de negocio solo establece contexto de acceso; la futura capa de sincronización debe particionar cachés/outbox por business_id y volver a validar membresía y permisos en servidor.
