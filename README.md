# Generador dinámico de QR con vCard

Aplicación web sin compilación. Incluye:

- Inicio de sesión administrativo con Supabase Auth.
- Creación, edición, búsqueda, activación y eliminación de contactos.
- Un QR permanente por contacto.
- Página pública adaptada a celulares.
- Botón **Guardar contacto** que descarga un archivo `.vcf` compatible con Android y iPhone.
- Botones para llamar, WhatsApp, correo, web y compartir.
- Descarga del QR en PNG.
- Seguridad con Row Level Security: el público solo ve tarjetas activas y cada administrador gestiona sus propios registros.

## 1. Crear el proyecto Supabase

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor**.
3. Copia y ejecuta todo el contenido de `supabase.sql`.
4. Ve a **Authentication > Users** y crea el usuario administrador con correo y contraseña.
5. En **Authentication > Providers > Email**, desactiva el registro público si no quieres que otras personas creen cuentas.

## 2. Configurar la aplicación

Edita `js/config.js`:

```js
export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON_KEY = 'TU_CLAVE_PUBLICA';
export const PUBLIC_BASE_URL = 'https://tuusuario.github.io/qr-contactos';
```

La clave pública de Supabase puede estar en el navegador. **Nunca** coloques la `service_role` en estos archivos.

## 3. Probar localmente

No abras `index.html` con doble clic, porque los módulos JavaScript necesitan un servidor web.

Opciones:

- Visual Studio Code + extensión Live Server.
- Python: `python -m http.server 8080`
- Node: `npx serve .`

Después abre la dirección indicada por el servidor.

## 4. Publicar en GitHub Pages

1. Crea un repositorio, por ejemplo `qr-contactos`.
2. Sube todos los archivos manteniendo las carpetas.
3. En GitHub: **Settings > Pages**.
4. Publica desde la rama principal y carpeta raíz.
5. Coloca la URL final en `PUBLIC_BASE_URL` y vuelve a subir `js/config.js`.

## Funcionamiento dinámico

El QR guarda una URL como:

`https://tuusuario.github.io/qr-contactos/contact.html?c=danni-fajardo-abc12`

Los datos viven en Supabase. Puedes cambiar el celular, empresa o cargo desde el panel y el QR impreso no cambia, porque conserva el mismo `slug`.

## Recomendaciones antes de imprimir

- Prueba cada QR con Android y iPhone.
- Usa un tamaño mínimo aproximado de 3 x 3 cm.
- Conserva margen blanco alrededor.
- Evita colores demasiado claros.
- No desactives o elimines el registro mientras el QR esté en uso.

## Estructura

- `index.html`: panel administrativo.
- `contact.html`: tarjeta pública.
- `assets/styles.css`: diseño.
- `js/admin.js`: CRUD, autenticación y QR.
- `js/contact.js`: consulta pública y descarga vCard.
- `js/shared.js`: utilidades y construcción de la vCard.
- `js/config.js`: conexión Supabase y URL pública.
- `supabase.sql`: base de datos, políticas y permisos.
