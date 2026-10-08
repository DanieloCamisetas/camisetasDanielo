# Generador de Hojas de Pedido · Camisetas

App de una sola página (Next.js App Router + Tailwind CSS) para crear hojas de
pedido de camisetas y exportarlas como imagen PNG lista para enviar al proveedor.

## Uso

```bash
npm install
npm run dev      # http://localhost:3000
```

Para producción:

```bash
npm run build && npm start
```

## Qué hace

- **Artículos dinámicos**: añade / elimina / reordena / duplica filas. Cada una
  con imagen del producto (URL o subida con vista previa), talla, nombre,
  dorsal, **uno o varios parches/detalles** (imágenes) y una nota opcional.
- **Extras**: filas destacadas en amarillo (llaveros, avisos…).
- **Datos de envío**: Nombre, Teléfono, Nación, Provincia, Municipio, Dirección
  y Código Postal.
- **Vista previa en vivo** de la hoja tal cual la recibe el proveedor.
- **Exportar**: «Descargar imagen (PNG)» y «Copiar» al portapapeles, en alta
  resolución (×3) con `html-to-image`.

## Notas

- Las **imágenes subidas** (archivos locales) son las más fiables para la
  captura, porque se convierten a *data URL* y no dependen de CORS.
- Las imágenes por **URL externa** pueden fallar al exportar si el servidor de
  origen bloquea el acceso (CORS). Si ves un error al generar, sube el archivo.

## Inventario (`/inventario`)

Misma estructura que `Inventario_Camisetas_SIMPLE.xlsx`: una fila por
combinación de equipo, temporada, modelo, talla, nombre, dorsal, parches y
ubicación, con su cantidad. Compartido entre móviles (Postgres en Neon).

- **Flujo rápido**: «+ Nueva camiseta» (foto, equipo, temporada, modelo) →
  elige qué lleva («Lisa» o «+ Nombre / parche») → un toque en la talla por
  cada camiseta (+1). Las combinaciones ya usadas (p. ej. «VINICIUS 7 ·
  Champions») quedan como botones para cambiar de una a otra con un toque, y
  al escribir un nombre ya usado en ese equipo se rellena su dorsal.
- **Código de barras = buscador**: «📷 Buscar por código» abre la camiseta (si
  varias comparten código, eliges cuál). Si el código es nuevo, se crea una
  camiseta o se asigna a una existente. A una camiseta ya creada se le añade con
  «📷 Añadir código de barras». También vale un lector Bluetooth/USB.
- **Excel**: descarga un CSV con las columnas de la hoja INVENTARIO.
- Las listas (equipos, temporadas, modelos, ubicaciones, parches sin foto) se
  editan en `app/config.ts`. Los parches con foto salen de `/public`.

### Ventas, reservas y más

- **Vender / reservar**: en Contar, toca una fila → «Vender 1» (precio sugerido =
  PVP + suplementos) o «Reservar 1» (para quién y hasta cuándo). Las reservadas
  siguen en stock pero no salen como libres ni en el catálogo.
- **Ventas** (`/inventario/ventas`): ingresos y beneficio del mes, por meses, lo
  más vendido (90 días), qué reponer, camisetas paradas, reservas activas y
  últimas ventas (con «Devolver»).
- **Historial** (`/inventario/historial`): quién contó, vendió o reservó qué y
  cuándo. Cada móvil elige su nombre la primera vez.
- **Etiquetas QR** (`/inventario/etiquetas`): una etiqueta por camiseta (hojas
  A4 de 21, 63,5×38,1 mm). Escanearla en Contar abre su fila exacta.
- **Catálogo público** (`/catalogo`, sin PIN): lo disponible con foto, tallas y
  precio; el cliente elige y lo pide por WhatsApp (`WHATSAPP_NUMBER`).
- **Pedidos**: «📦 Desde inventario» añade camisetas del stock al pedido y
  «Descontar del stock» las registra como vendidas.
- **App instalable y sin conexión**: «Añadir a pantalla de inicio». Sin cobertura
  se sigue contando y los toques se suben solos al volver la señal.
- **Filtros** por equipo y talla, y **⧉ Duplicar** camiseta en el formulario.

Ajustes en `app/config.ts`: `PRICE_EXTRA_NAME`, `PRICE_EXTRA_PATCH`,
`LOW_STOCK`, `STALE_DAYS`, `CATALOG_TITLE`, `CATALOG_MESSAGE` y
`WHATSAPP_NUMBER`.

Configuración:

- Variable `DATABASE_URL` (Vercel → Settings → Environment Variables; en local
  en `.env.local`). Las tablas se crean solas.
- **PIN**: la primera vez que se abre `/inventario` pide crear uno y se guarda
  (cifrado) en la base de datos. Para cambiarlo, borrar la fila `pin` de la
  tabla `inv_settings`, o fijar `INVENTORY_PIN` en Vercel (tiene prioridad).
