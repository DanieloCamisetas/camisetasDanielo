import { NextResponse } from "next/server";
import {
  addStock,
  checkPin,
  createPin,
  deleteProduct,
  listAll,
  saveProduct,
} from "../../inventario/store";
import { normalizeVariantKey } from "../../types";

export const dynamic = "force-dynamic";

const MAX_PHOTO = 400_000; // ~300 KB de JPEG en base64: de sobra para una miniatura

const json = (data: object, status = 200) => NextResponse.json(data, { status });
const fail = (e: unknown, status = 500) =>
  json({ error: e instanceof Error ? e.message : String(e) }, status);

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().replace(/\|/g, " ").slice(0, max) : "";

/* Freno a quien pruebe PINs a lo loco: 10 fallos por IP cada 10 minutos.
   Es por instancia (en memoria), suficiente para frenar intentos a mano. */
const failures = new Map<string, { n: number; until: number }>();
const ipOf = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

/** null si el PIN es válido; si no, la respuesta de error a devolver. */
async function guard(req: Request): Promise<NextResponse | null> {
  const ip = ipOf(req);
  const f = failures.get(ip);
  if (f && f.n >= 10 && f.until > Date.now())
    return fail("Demasiados intentos. Espera unos minutos.", 429);

  const status = await checkPin(req.headers.get("x-pin") ?? "");
  if (status === "ok") {
    failures.delete(ip);
    return null;
  }
  if (status === "none") return json({ error: "Crea un PIN", pin: "none" }, 401);

  const next = f && f.until > Date.now() ? f.n + 1 : 1;
  failures.set(ip, { n: next, until: Date.now() + 10 * 60_000 });
  return json({ error: "PIN incorrecto", pin: "bad" }, 401);
}

/** Productos y variantes con stock. */
export async function GET(req: Request) {
  try {
    const denied = await guard(req);
    if (denied) return denied;
    return json(await listAll());
  } catch (e) {
    return fail(e);
  }
}

/**
 * Acciones:
 *  { action: "createPin", pin }                    solo la primera vez
 *  { action: "saveProduct", id, team, season, kit, photo, barcode, cost, price, notes }
 *  { action: "deleteProduct", id }
 *  { action: "stock", productId, size, name, dorsal, patches, location, delta }
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("JSON no válido", 400);
  }

  try {
    if (body.action === "createPin") {
      const pin = str(body.pin, 32);
      if (pin.length < 4) return fail("El PIN debe tener al menos 4 cifras", 400);
      if (!(await createPin(pin))) return fail("Ya hay un PIN creado", 409);
      return json({ ok: true });
    }

    const denied = await guard(req);
    if (denied) return denied;

    switch (body.action) {
      case "saveProduct": {
        const id = str(body.id, 80);
        const photo = typeof body.photo === "string" ? body.photo : "";
        if (!id) return fail("Falta el id", 400);
        if (photo && (!photo.startsWith("data:image/") || photo.length > MAX_PHOTO))
          return fail("Foto no válida o demasiado grande", 400);
        const product = {
          id,
          team: str(body.team, 80),
          season: str(body.season, 20),
          kit: str(body.kit, 40),
          photo,
          barcode: str(body.barcode, 80),
          cost: str(body.cost, 20),
          price: str(body.price, 20),
          notes: str(body.notes, 500),
        };
        if (!product.team) return fail("Falta el equipo", 400);
        await saveProduct(product);
        return json({ ok: true });
      }
      case "deleteProduct": {
        await deleteProduct(str(body.id, 80));
        return json({ ok: true });
      }
      case "stock": {
        const delta = Number(body.delta);
        const key = normalizeVariantKey({
          productId: String(body.productId ?? ""),
          size: String(body.size ?? ""),
          name: String(body.name ?? ""),
          dorsal: String(body.dorsal ?? ""),
          patches: Array.isArray(body.patches) ? body.patches.map(String) : [],
          location: String(body.location ?? ""),
        });
        if (!key.productId || !key.size || !Number.isInteger(delta) || Math.abs(delta) > 1000)
          return fail("Datos de stock no válidos", 400);
        return json({ qty: await addStock(key, delta) });
      }
      default:
        return fail("Acción desconocida", 400);
    }
  } catch (e) {
    return fail(e);
  }
}
