export type OrderItem = {
  id: string;
  images: string[]; // 1..n imágenes del producto (URL o data-URL)
  sizes: string[]; // 1..n tallas para el mismo artículo
  name: string;
  dorsal: string;
  patches: string[]; // 0..n parches (URL o data-URL)
  note: string; // texto opcional en la columna de detalle
  price: string; // precio (texto libre: "12", "12€", etc.)
  /** Si sale del inventario: qué fila es y si ya se descontó del stock. */
  stock?: { key: InvVariantKey; label: string; done?: boolean };
};

export type ExtraRow = {
  id: string;
  text: string;
  image: string; // URL o data-URL (opcional)
};

export type PatchOption = {
  src: string; // ruta en /public
  label: string;
};

export type Customer = {
  name: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
};

export const emptyItem = (id: string): OrderItem => ({
  id,
  images: [""],
  sizes: [""],
  name: "",
  dorsal: "",
  patches: [""],
  note: "",
  price: "",
});

export const emptyCustomer: Customer = {
  name: "",
  phone: "",
  country: "",
  province: "",
  city: "",
  address: "",
  postalCode: "",
};

/**
 * Inventario (misma estructura que la hoja INVENTARIO del Excel).
 * Producto = la camiseta base (equipo + temporada + modelo).
 * Variante = una fila del Excel: talla + personalización + cantidad.
 */
export type InvProduct = {
  id: string;
  team: string; // EQUIPO
  season: string; // TEMPORADA
  kit: string; // MODELO (Home, Away…)
  photo: string; // data-URL solo al cambiarla; la lista no la trae (ver photoV)
  photoV?: string; // versión de la foto: /api/foto/<id>?v=<photoV>
  barcode: string; // código de la etiqueta (varias camisetas pueden compartirlo)
  cost: string; // COSTE (€)
  price: string; // PVP (€)
  notes: string; // NOTAS
};

export type InvVariantKey = {
  productId: string;
  size: string; // TALLA
  name: string; // NOMBRE
  dorsal: string; // DORSAL
  patches: string[]; // PARCHE(S), por nombre
  location: string; // UBICACIÓN
};

export type InvVariant = InvVariantKey & { id: string; qty: number };

/** Una unidad apartada para un cliente (cuenta en stock, pero no está disponible). */
export type InvReservation = {
  id: string;
  variantId: string;
  productId: string;
  customer: string;
  until: string; // YYYY-MM-DD o ""
  note: string;
  user: string;
  createdAt: string;
};

/** Un movimiento del historial. */
export type InvMovement = {
  id: string;
  at: string;
  user: string;
  kind: "count" | "sale" | "reserve" | "unreserve";
  productId: string;
  variantId: string;
  productTitle: string;
  label: string;
  delta: number;
  unitPrice: number | null;
  customer: string;
};

/** Limpia una variante igual en el móvil y en el servidor. */
export const normalizeVariantKey = (k: InvVariantKey): InvVariantKey => {
  const clean = (v: string, max: number) => v.trim().replace(/\|/g, " ").slice(0, max);
  return {
    productId: clean(k.productId, 80),
    size: clean(k.size, 20),
    name: clean(k.name, 40).toUpperCase(),
    dorsal: clean(k.dorsal, 4),
    patches: [...new Set(k.patches.map((p) => clean(p, 60)).filter(Boolean))].sort().slice(0, 10),
    location: clean(k.location, 30),
  };
};

/** Id determinista de una variante: misma combinación = misma fila. */
export const variantId = (key: InvVariantKey) => {
  const k = normalizeVariantKey(key);
  return [k.productId, k.size, k.name, k.dorsal, k.patches.join("+"), k.location].join("|");
};

/** "VINICIUS 7 · Champions" / "Lisa". */
export const comboLabel = (c: Pick<InvVariantKey, "name" | "dorsal" | "patches">) =>
  [
    [c.name.trim().toUpperCase(), c.dorsal.trim()].filter(Boolean).join(" ") || "Lisa",
    c.patches.join(" + "),
  ]
    .filter(Boolean)
    .join(" · ");

/** "M · VINICIUS 7 · Champions" */
export const variantLabel = (v: Pick<InvVariantKey, "size" | "name" | "dorsal" | "patches">) =>
  `${v.size} · ${comboLabel(v)}`;

export const photoSrc = (p: Pick<InvProduct, "id" | "photo" | "photoV">) =>
  p.photo || (p.photoV ? `/api/foto/${encodeURIComponent(p.id)}?v=${p.photoV}` : "");

export const productTitle = (p: Pick<InvProduct, "team" | "kit" | "season">) =>
  [p.team, p.kit, p.season].filter(Boolean).join(" · ");

/* ---------------------------- Catálogo público ---------------------------- */

export type CatalogOption = {
  size: string;
  name: string;
  dorsal: string;
  patches: string[];
  price: number; // 0 = consultar
  few: boolean; // quedan 1-2
};

export type CatalogProduct = {
  id: string;
  team: string;
  season: string;
  kit: string;
  photoV: string;
  options: CatalogOption[];
};
