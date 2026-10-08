import { NextResponse } from "next/server";
import {
  addStock,
  cancelReservation,
  checkPin,
  createPin,
  deleteProduct,
  history,
  listAll,
  reserve,
  returnSale,
  saveProduct,
  stats,
} from "../../inventario/store";
import { type InvVariantKey, normalizeVariantKey, variantLabel } from "../../types";

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

/** Quién está usando la app (lo elige cada móvil la primera vez). */
const userOf = (req: Request) => {
  try {
    return decodeURIComponent(req.headers.get("x-user") ?? "").trim().slice(0, 30);
  } catch {
    return "";
  }
};

const keyOf = (body: Record<string, unknown>): InvVariantKey =>
  normalizeVariantKey({
    productId: String(body.productId ?? ""),
    size: String(body.size ?? ""),
    name: String(body.name ?? ""),
    dorsal: String(body.dorsal ?? ""),
    patches: Array.isArray(body.patches) ? body.patches.map(String) : [],
    location: String(body.location ?? ""),
  });

/**
 * GET                    productos, variantes y reservas activas
 * GET ?view=history      historial (?before=<id> para ver más antiguos)
 * GET ?view=stats        ventas, lo más vendido, reponer, paradas
 */
export async function GET(req: Request) {
  try {
    const denied = await guard(req);
    if (denied) return denied;
    const url = new URL(req.url);
    const view = url.searchParams.get("view");
    if (view === "history")
      return json({ movements: await history(url.searchParams.get("before") || undefined) });
    if (view === "stats") return json(await stats());
    return json(await listAll());
  } catch (e) {
    return fail(e);
  }
}

/**
 * Acciones (POST, cuerpo JSON con "action"):
 *  createPin          { pin }                                  solo la primera vez
 *  saveProduct        { id, team, season, kit, photo?, copyPhotoFrom?, barcode, cost, price, notes }
 *  deleteProduct      { id }
 *  stock              { ...variante, delta, opId, productTitle }
 *  sell               { ...variante, price, customer, opId, productTitle, reservationId? }
 *  returnSale         { movementId }
 *  reserve            { ...variante, customer, until, note, productTitle }
 *  cancelReservation  { id }
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
    const user = userOf(req);

    switch (body.action) {
      case "saveProduct": {
        const id = str(body.id, 80);
        // Solo una data-URL cambia la foto; cualquier otra cosa conserva la actual.
        const photo =
          typeof body.photo === "string" && body.photo.startsWith("data:image/")
            ? body.photo
            : null;
        if (!id) return fail("Falta el id", 400);
        if (photo && photo.length > MAX_PHOTO) return fail("Foto demasiado grande", 400);
        const product = {
          id,
          team: str(body.team, 80),
          season: str(body.season, 20),
          kit: str(body.kit, 40),
          photo,
          copyPhotoFrom: str(body.copyPhotoFrom, 80) || undefined,
          barcode: str(body.barcode, 80).replace(/\s/g, ""),
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

      case "stock":
      case "sell": {
        const key = keyOf(body);
        const opId = str(body.opId, 80);
        const sale = body.action === "sell";
        const delta = sale ? -1 : Number(body.delta);
        if (!key.productId || !key.size || !opId || !Number.isInteger(delta) || Math.abs(delta) > 1000)
          return fail("Datos de stock no válidos", 400);
        const price = Number(body.price);
        const qty = await addStock(key, delta, {
          opId,
          user,
          kind: sale ? "sale" : "count",
          productTitle: str(body.productTitle, 160),
          label: variantLabel(key),
          price: sale && body.price !== "" && Number.isFinite(price) && price >= 0 ? price : null,
          customer: sale ? str(body.customer, 80) : "",
          reservationId: sale ? str(body.reservationId, 80) || undefined : undefined,
        });
        return json({ qty });
      }

      case "returnSale": {
        await returnSale(str(body.movementId, 30), user);
        return json({ ok: true });
      }

      case "reserve": {
        const key = keyOf(body);
        const customer = str(body.customer, 80);
        if (!key.productId || !key.size) return fail("Datos de reserva no válidos", 400);
        if (!customer) return fail("¿Para quién es la reserva?", 400);
        const until = str(body.until, 10);
        const id = await reserve(key, {
          customer,
          until: /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : "",
          note: str(body.note, 200),
          user,
          productTitle: str(body.productTitle, 160),
          label: variantLabel(key),
        });
        return json({ id });
      }

      case "cancelReservation": {
        await cancelReservation(str(body.id, 80), user);
        return json({ ok: true });
      }

      default:
        return fail("Acción desconocida", 400);
    }
  } catch (e) {
    return fail(e);
  }
}
