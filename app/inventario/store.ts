import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { type InvProduct, type InvVariant, type InvVariantKey, variantId } from "../types";

/**
 * Inventario en Postgres (Neon). Tablas:
 *  inv_products  camiseta base (equipo, temporada, modelo, foto, precios…)
 *  inv_variants  una fila por combinación talla+nombre+dorsal+parches+ubicación
 *  inv_settings  ajustes (PIN)
 */

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export class NoDatabaseError extends Error {
  constructor() {
    super("Falta DATABASE_URL: añádela en Vercel → Settings → Environment Variables.");
  }
}

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
      barcode TEXT NOT NULL DEFAULT '',
      cost TEXT NOT NULL DEFAULT '',
      price TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
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

/* ------------------------------ Lectura ------------------------------ */

export async function listAll(): Promise<{ products: InvProduct[]; variants: InvVariant[] }> {
  const sql = await db();
  const [products, variants] = await Promise.all([
    sql`SELECT id, team, season, kit, photo, barcode, cost, price, notes
        FROM inv_products ORDER BY created_at`,
    sql`SELECT id, product_id, size, name, dorsal, patches, location, qty
        FROM inv_variants WHERE qty > 0 ORDER BY created_at`,
  ]);
  return {
    products: products as InvProduct[],
    variants: (variants as Record<string, never>[]).map((v) => ({
      id: v.id,
      productId: v.product_id,
      size: v.size,
      name: v.name,
      dorsal: v.dorsal,
      patches: v.patches,
      location: v.location,
      qty: v.qty,
    })),
  };
}

/* ----------------------------- Productos ----------------------------- */

export async function saveProduct(p: InvProduct) {
  const sql = await db();
  await sql`INSERT INTO inv_products (id, team, season, kit, photo, barcode, cost, price, notes)
    VALUES (${p.id}, ${p.team}, ${p.season}, ${p.kit}, ${p.photo}, ${p.barcode},
            ${p.cost}, ${p.price}, ${p.notes})
    ON CONFLICT (id) DO UPDATE SET
      team = EXCLUDED.team, season = EXCLUDED.season, kit = EXCLUDED.kit,
      photo = EXCLUDED.photo, barcode = EXCLUDED.barcode, cost = EXCLUDED.cost,
      price = EXCLUDED.price, notes = EXCLUDED.notes`;
}

export async function deleteProduct(id: string) {
  const sql = await db();
  await sql`DELETE FROM inv_products WHERE id = ${id}`;
}

/* ------------------------------ Stock ------------------------------ */

/** Suma (o resta) unidades a una variante; la crea si no existe. Atómico. */
export async function addStock(k: InvVariantKey, delta: number): Promise<number> {
  const sql = await db();
  const { patches } = k; // ya normalizada por la API
  const id = variantId(k);
  const rows = await sql`INSERT INTO inv_variants
      (id, product_id, size, name, dorsal, patches, location, qty)
    VALUES (${id}, ${k.productId}, ${k.size}, ${k.name}, ${k.dorsal}, ${patches},
            ${k.location}, GREATEST(0, ${delta}::int))
    ON CONFLICT (id) DO UPDATE SET qty = GREATEST(0, inv_variants.qty + ${delta}::int)
    RETURNING qty`;
  return (rows as { qty: number }[])[0]?.qty ?? 0;
}

/* ------------------------------- PIN ------------------------------- */

const hashPin = (pin: string, salt: string) =>
  createHash("sha256").update(`${salt}:${pin}`).digest("hex");

let cachedPin: string | null = null; // "salt:hash"

async function storedPin(): Promise<string | null> {
  if (cachedPin) return cachedPin;
  const sql = await db();
  const rows = (await sql`SELECT value FROM inv_settings WHERE key = 'pin'`) as { value: string }[];
  return (cachedPin = rows[0]?.value ?? null);
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
