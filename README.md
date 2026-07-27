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
