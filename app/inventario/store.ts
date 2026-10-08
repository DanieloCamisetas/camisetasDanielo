import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { LOW_STOCK, STALE_DAYS } from "../config";
import {
  type InvMovement,
  type InvProduct,
  type InvReservation,
  type InvVariant,
  type InvVariantKey,
  variantId,
} from "../types";

/**
 * Inventario en Postgres (Neon). Tablas:
 *  inv_products      camiseta base (equipo, temporada, modelo, foto, precios…)
 *  inv_variants      una fila por combinación talla+nombre+dorsal+parches+ubicación
 *  inv_movements     historial: cada suma/resta, venta y reserva (quién y cuándo)
 *  inv_reservations  unidades apartadas para un cliente
 *  inv_settings      ajustes (PIN)
 */

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export class NoDatabaseError extends Error {
  constructor() {
    super("Falta DATABASE_URL: añádela en Vercel → Settings → Environment Variables.");
  }
}

type Row = Record<string, unknown>;
let sqlClient: ReturnType<typeof neon> | null = null;
let ready: Promise<unknown> | null = null;

async function db() {
  if (!DATABASE_URL) throw new NoDatabaseError();
  const sql = (sqlClient ??= neon(DATABASE_URL));
  ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS inv_products (
      id TEXT PRIMARY KEY,
      team TEXT NOT NULL DEFAULT '',
      season TEXT NOT NULL DEFAULT '',
      kit TEXT NOT NULL DEFAULT '',
      photo TEXT NOT NULL DEFAULT '',
      cost TEXT NOT NULL DEFAULT '',
      price TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`ALTER TABLE inv_products ADD COLUMN IF NOT EXISTS barcode TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE inv_products ADD COLUMN IF NOT EXISTS photo_v TEXT NOT NULL DEFAULT ''`;
    // Fotos guardadas antes de existir photo_v.
    await sql`UPDATE inv_products SET photo_v = substr(md5(photo), 1, 10)
      WHERE photo_v = '' AND photo <> ''`;
    await sql`CREATE TABLE IF NOT EXISTS inv_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES inv_products(id) ON DELETE CASCADE,
      size TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      dorsal TEXT NOT NULL DEFAULT '',
      patches TEXT[] NOT NULL DEFAULT '{}',
      location TEXT NOT NULL DEFAULT '',
      qty INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS inv_movements (
      id BIGSERIAL PRIMARY KEY,
      op_id TEXT UNIQUE,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      product_title TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      delta INTEGER NOT NULL DEFAULT 0,
      unit_price NUMERIC,
      unit_cost NUMERIC,
      customer TEXT NOT NULL DEFAULT ''
    )`;
    await sql`CREATE INDEX IF NOT EXISTS inv_movements_at ON inv_movements (at DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS inv_reservations (
      id TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      customer TEXT NOT NULL DEFAULT '',
      until DATE,
      note TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS inv_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  await ready;
  return sql;
}

/* ------------------------------ Mapeos ------------------------------ */

const toProduct = (r: Row): InvProduct => ({
  id: r.id as string,
  team: r.team as string,
  season: r.season as string,
  kit: r.kit as string,
  photo: "",
  photoV: r.photo_v as string,
  barcode: r.barcode as string,
  cost: r.cost as string,
  price: r.price as string,
  notes: r.notes as string,
});

const toVariant = (r: Row): InvVariant => ({
  id: r.id as string,
  productId: r.product_id as string,
  size: r.size as string,
  name: r.name as string,
  dorsal: r.dorsal as string,
  patches: r.patches as string[],
  location: r.location as string,
  qty: r.qty as number,
});

const toReservation = (r: Row): InvReservation => ({
  id: r.id as string,
  variantId: r.variant_id as string,
  productId: r.product_id as string,
  customer: r.customer as string,
  until: r.until ? new Date(r.until as string).toISOString().slice(0, 10) : "",
  note: r.note as string,
  user: r.user_name as string,
  createdAt: new Date(r.created_at as string).toISOString(),
});

const toMovement = (r: Row): InvMovement => ({
  id: String(r.id),
  at: new Date(r.at as string).toISOString(),
  user: r.user_name as string,
  kind: r.kind as InvMovement["kind"],
  productId: r.product_id as string,
  variantId: r.variant_id as string,
  productTitle: r.product_title as string,
  label: r.label as string,
  delta: r.delta as number,
  unitPrice: r.unit_price == null ? null : Number(r.unit_price),
  customer: r.customer as string,
});

/* ------------------------------ Lectura ------------------------------ */

export async function listAll() {
  const sql = await db();
  const [products, variants, reservations] = (await Promise.all([
    sql`SELECT id, team, season, kit, photo_v, barcode, cost, price, notes
        FROM inv_products ORDER BY created_at`,
    sql`SELECT id, product_id, size, name, dorsal, patches, location, qty
        FROM inv_variants WHERE qty > 0 ORDER BY created_at`,
    sql`SELECT * FROM inv_reservations WHERE status = 'active' ORDER BY created_at`,
  ])) as Row[][];
  return {
    products: products.map(toProduct),
    variants: variants.map(toVariant),
    reservations: reservations.map(toReservation),
  };
}

export async function getPhoto(id: string): Promise<string | null> {
  const sql = await db();
  const rows = (await sql`SELECT photo FROM inv_products WHERE id = ${id}`) as Row[];
  return (rows[0]?.photo as string) || null;
}

/* ----------------------------- Productos ----------------------------- */

/**
 * photo: data-URL nueva, o null para conservar la que hay.
 * copyPhotoFrom: al duplicar, copia la foto de otra camiseta.
 */
export async function saveProduct(
  p: Omit<InvProduct, "photo" | "photoV"> & { photo: string | null; copyPhotoFrom?: string },
) {
  const sql = await db();
  const photoV = p.photo ? createHash("md5").update(p.photo).digest("hex").slice(0, 10) : null;
  const from = p.copyPhotoFrom ?? "";
  await sql`INSERT INTO inv_products (id, team, season, kit, photo, photo_v, barcode, cost, price, notes)
    VALUES (${p.id}, ${p.team}, ${p.season}, ${p.kit},
      COALESCE(${p.photo}, (SELECT photo FROM inv_products WHERE id = ${from}), ''),
      COALESCE(${photoV}, (SELECT photo_v FROM inv_products WHERE id = ${from}), ''),
      ${p.barcode}, ${p.cost}, ${p.price}, ${p.notes})
    ON CONFLICT (id) DO UPDATE SET
      team = EXCLUDED.team, season = EXCLUDED.season, kit = EXCLUDED.kit,
      photo = COALESCE(${p.photo}, inv_products.photo),
      photo_v = COALESCE(${photoV}, inv_products.photo_v),
      barcode = EXCLUDED.barcode, cost = EXCLUDED.cost,
      price = EXCLUDED.price, notes = EXCLUDED.notes`;
}

export async function deleteProduct(id: string) {
  const sql = await db();
  await sql`DELETE FROM inv_products WHERE id = ${id}`;
  await sql`UPDATE inv_reservations SET status = 'cancelled'
    WHERE product_id = ${id} AND status = 'active'`;
}

/* ------------------------------ Stock ------------------------------ */

export type StockMeta = {
  opId: string; // id único del toque: reintentar no suma dos veces
  user: string;
  kind: "count" | "sale";
  productTitle: string;
  label: string;
  price?: number | null; // solo ventas
  customer?: string;
  reservationId?: string; // venta de una unidad reservada
};

/**
 * Suma o resta unidades a una variante (la crea si no existe) y lo apunta en el
 * historial, todo en una sola sentencia. Si el opId ya se procesó (reintento
 * tras perder la conexión) no hace nada y devuelve la cantidad actual.
 */
export async function addStock(k: InvVariantKey, delta: number, meta: StockMeta) {
  const sql = await db();
  const id = variantId(k);
  const rows = (await sql`
    WITH m AS (
      INSERT INTO inv_movements
        (op_id, user_name, kind, product_id, variant_id, product_title, label,
         delta, unit_price, unit_cost, customer)
      VALUES (${meta.opId}, ${meta.user}, ${meta.kind}, ${k.productId}, ${id},
        ${meta.productTitle}, ${meta.label}, ${delta}::int, ${meta.price ?? null}::numeric,
        (SELECT CASE WHEN cost ~ '^[^0-9]*[0-9]+([.,][0-9]+)?[^0-9]*$'
                THEN replace(regexp_replace(cost, '[^0-9,.]', '', 'g'), ',', '.')::numeric END
         FROM inv_products WHERE id = ${k.productId}),
        ${meta.customer ?? ""})
      ON CONFLICT (op_id) DO NOTHING
      RETURNING id
    ), r AS (
      UPDATE inv_reservations SET status = 'done'
      WHERE id = ${meta.reservationId ?? ""} AND EXISTS (SELECT 1 FROM m)
      RETURNING id
    )
    INSERT INTO inv_variants (id, product_id, size, name, dorsal, patches, location, qty)
    SELECT ${id}, ${k.productId}, ${k.size}, ${k.name}, ${k.dorsal}, ${k.patches},
      ${k.location}, GREATEST(0, ${delta}::int)
    WHERE EXISTS (SELECT 1 FROM m)
    ON CONFLICT (id) DO UPDATE SET qty = GREATEST(0, inv_variants.qty + ${delta}::int)
    RETURNING qty`) as Row[];
  if (rows.length) return rows[0].qty as number;
  const current = (await sql`SELECT qty FROM inv_variants WHERE id = ${id}`) as Row[];
  return (current[0]?.qty as number) ?? 0;
}

/** Devuelve una venta al stock (+1) y la descuenta de las cifras de ventas. */
export async function returnSale(movementId: string, user: string) {
  const sql = await db();
  const rows = (await sql`
    WITH s AS (
      SELECT * FROM inv_movements WHERE id = ${movementId}::bigint AND kind = 'sale' AND delta < 0
    ), m AS (
      INSERT INTO inv_movements
        (op_id, user_name, kind, product_id, variant_id, product_title, label,
         delta, unit_price, unit_cost, customer)
      SELECT 'return-' || s.id, ${user}, 'sale', s.product_id, s.variant_id, s.product_title,
        s.label, -s.delta, s.unit_price, s.unit_cost, s.customer
      FROM s
      ON CONFLICT (op_id) DO NOTHING
      RETURNING variant_id, delta
    )
    UPDATE inv_variants v SET qty = v.qty + m.delta
    FROM m WHERE v.id = m.variant_id
    RETURNING v.qty`) as Row[];
  if (!rows.length) throw new Error("Esa venta ya estaba devuelta o no existe");
}

/* ----------------------------- Reservas ----------------------------- */

export async function reserve(
  k: InvVariantKey,
  r: { customer: string; until: string; note: string; user: string; productTitle: string; label: string },
) {
  const sql = await db();
  const vid = variantId(k);
  const id = randomUUID();
  // Solo si queda alguna unidad sin reservar.
  const rows = (await sql`
    INSERT INTO inv_reservations (id, variant_id, product_id, customer, until, note, user_name)
    SELECT ${id}, ${vid}, ${k.productId}, ${r.customer}, ${r.until || null}::date, ${r.note}, ${r.user}
    WHERE (SELECT qty FROM inv_variants WHERE id = ${vid}) >
          (SELECT count(*) FROM inv_reservations WHERE variant_id = ${vid} AND status = 'active')
    RETURNING id`) as Row[];
  if (!rows.length) throw new Error("No quedan unidades libres para reservar");
  await sql`INSERT INTO inv_movements
      (op_id, user_name, kind, product_id, variant_id, product_title, label, delta, customer)
    VALUES (${"res-" + id}, ${r.user}, 'reserve', ${k.productId}, ${vid},
      ${r.productTitle}, ${r.label}, 0, ${r.customer})`;
  return id;
}

export async function cancelReservation(id: string, user: string) {
  const sql = await db();
  const rows = (await sql`UPDATE inv_reservations SET status = 'cancelled'
    WHERE id = ${id} AND status = 'active'
    RETURNING variant_id, product_id, customer`) as Row[];
  if (!rows.length) return;
  const r = rows[0];
  await sql`INSERT INTO inv_movements
      (op_id, user_name, kind, product_id, variant_id, product_title, label, delta, customer)
    SELECT ${"unres-" + id}, ${user}, 'unreserve', ${r.product_id as string}, ${r.variant_id as string},
      COALESCE((SELECT product_title FROM inv_movements WHERE op_id = ${"res-" + id}), ''),
      COALESCE((SELECT label FROM inv_movements WHERE op_id = ${"res-" + id}), ''),
      0, ${r.customer as string}
    ON CONFLICT (op_id) DO NOTHING`;
}

/* ----------------------------- Historial ----------------------------- */

export async function history(before?: string, limit = 200) {
  const sql = await db();
  const rows = (before
    ? await sql`SELECT * FROM inv_movements WHERE id < ${before}::bigint ORDER BY id DESC LIMIT ${limit}`
    : await sql`SELECT * FROM inv_movements ORDER BY id DESC LIMIT ${limit}`) as Row[];
  return rows.map(toMovement);
}

/* ---------------------------- Estadísticas ---------------------------- */

export async function stats() {
  const sql = await db();
  const [months, top, recent, lowStock, stale] = (await Promise.all([
    // Ventas por mes (las devoluciones restan).
    sql`SELECT to_char(date_trunc('month', at AT TIME ZONE 'Europe/Madrid'), 'YYYY-MM') AS month,
          SUM(-delta)::int AS units,
          COALESCE(SUM(-delta * unit_price), 0)::float AS revenue,
          COALESCE(SUM(-delta * unit_cost), 0)::float AS cost,
          COUNT(*) FILTER (WHERE unit_price IS NULL OR unit_cost IS NULL)::int AS incomplete
        FROM inv_movements WHERE kind = 'sale'
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    // Lo más vendido en 90 días.
    sql`SELECT product_id, MAX(product_title) AS title, SUM(-delta)::int AS units,
          COALESCE(SUM(-delta * unit_price), 0)::float AS revenue
        FROM inv_movements
        WHERE kind = 'sale' AND at > now() - interval '90 days'
        GROUP BY product_id HAVING SUM(-delta) > 0
        ORDER BY units DESC LIMIT 10`,
    // Últimas ventas (con su devolución, si la hubo).
    sql`SELECT m.*, EXISTS (SELECT 1 FROM inv_movements r WHERE r.op_id = 'return-' || m.id) AS returned
        FROM inv_movements m
        WHERE m.kind = 'sale' AND m.delta < 0
        ORDER BY m.id DESC LIMIT 40`,
    // Se venden y queda poco (stock libre = stock - reservas).
    sql`WITH sold AS (
          SELECT product_id, SUM(-delta)::int AS units FROM inv_movements
          WHERE kind = 'sale' AND at > now() - interval '30 days'
          GROUP BY product_id HAVING SUM(-delta) > 0
        ), free AS (
          SELECT p.id, COALESCE((SELECT SUM(qty) FROM inv_variants v WHERE v.product_id = p.id), 0)
            - (SELECT count(*) FROM inv_reservations r WHERE r.product_id = p.id AND r.status = 'active')
            AS available
          FROM inv_products p
        )
        SELECT f.id AS product_id, f.available::int AS available, s.units AS sold
        FROM sold s JOIN free f ON f.id = s.product_id
        WHERE f.available <= ${LOW_STOCK}
        ORDER BY s.units DESC, f.available ASC LIMIT 20`,
    // Con stock y sin venderse desde hace tiempo.
    sql`SELECT p.id AS product_id, s.stock::int AS stock,
          GREATEST(p.created_at, COALESCE(l.last_sale, p.created_at)) AS since
        FROM inv_products p
        JOIN (SELECT product_id, SUM(qty) AS stock FROM inv_variants
              GROUP BY product_id HAVING SUM(qty) > 0) s ON s.product_id = p.id
        LEFT JOIN (SELECT product_id, MAX(at) AS last_sale FROM inv_movements
                   WHERE kind = 'sale' AND delta < 0 GROUP BY product_id) l ON l.product_id = p.id
        WHERE GREATEST(p.created_at, COALESCE(l.last_sale, p.created_at))
              < now() - make_interval(days => ${STALE_DAYS})
        ORDER BY since ASC LIMIT 30`,
  ])) as Row[][];

  return {
    months: months.map((r) => ({
      month: r.month as string,
      units: r.units as number,
      revenue: r.revenue as number,
      cost: r.cost as number,
      incomplete: r.incomplete as number,
    })),
    top: top.map((r) => ({
      productId: r.product_id as string,
      title: r.title as string,
      units: r.units as number,
      revenue: r.revenue as number,
    })),
    recent: recent.map((r) => ({ ...toMovement(r), returned: r.returned as boolean })),
    lowStock: lowStock.map((r) => ({
      productId: r.product_id as string,
      available: r.available as number,
      sold: r.sold as number,
    })),
    stale: stale.map((r) => ({
      productId: r.product_id as string,
      stock: r.stock as number,
      since: new Date(r.since as string).toISOString(),
    })),
  };
}

export type InvStats = Awaited<ReturnType<typeof stats>>;

/* ------------------------------- PIN ------------------------------- */

const hashPin = (pin: string, salt: string) =>
  createHash("sha256").update(`${salt}:${pin}`).digest("hex");

// Caché corta: evita una consulta por toque, pero un cambio de PIN se nota en 1 min.
let cachedPin: { value: string | null; at: number } | null = null; // value = "salt:hash"

async function storedPin(): Promise<string | null> {
  if (cachedPin && Date.now() - cachedPin.at < 60_000) return cachedPin.value;
  const sql = await db();
  const rows = (await sql`SELECT value FROM inv_settings WHERE key = 'pin'`) as { value: string }[];
  cachedPin = { value: rows[0]?.value ?? null, at: Date.now() };
  return cachedPin.value;
}

/** "none" = aún no hay PIN (primera vez), "ok" o "bad". */
export async function checkPin(pin: string): Promise<"none" | "ok" | "bad"> {
  // Un PIN en las variables de Vercel tiene prioridad sobre el guardado.
  const envPin = process.env.INVENTORY_PIN;
  if (envPin) return pin === envPin ? "ok" : "bad";
  const stored = await storedPin();
  if (!stored) return "none";
  const [salt, hash] = stored.split(":");
  const a = Buffer.from(hashPin(pin, salt), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "bad";
}

/** Fija el PIN solo si todavía no existe (primer uso). */
export async function createPin(pin: string): Promise<boolean> {
  if (process.env.INVENTORY_PIN) return false;
  const sql = await db();
  const salt = randomBytes(16).toString("hex");
  const rows = await sql`INSERT INTO inv_settings (key, value)
    VALUES ('pin', ${`${salt}:${hashPin(pin, salt)}`})
    ON CONFLICT (key) DO NOTHING RETURNING key`;
  cachedPin = null;
  return (rows as unknown[]).length > 0;
}
