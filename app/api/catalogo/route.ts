import { NextResponse } from "next/server";
import { suggestedPrice, sizeOrder } from "../../inventario/pricing";
import { listAll } from "../../inventario/store";
import { type CatalogOption, type CatalogProduct, comboLabel } from "../../types";

export const dynamic = "force-dynamic";

/**
 * Catálogo público: solo lo disponible (stock menos reservas) y sin datos
 * internos (coste, ubicación, notas, cantidades exactas).
 */
export async function GET() {
  try {
    const { products, variants, reservations } = await listAll();
    const reserved = new Map<string, number>();
    for (const r of reservations) reserved.set(r.variantId, (reserved.get(r.variantId) ?? 0) + 1);

    const out: CatalogProduct[] = [];
    for (const p of products) {
      // Misma talla + personalización en distintas ubicaciones = una sola opción.
      const groups = new Map<string, CatalogOption & { available: number }>();
      for (const v of variants) {
        if (v.productId !== p.id) continue;
        const available = v.qty - (reserved.get(v.id) ?? 0);
        if (available <= 0) continue;
        const k = `${v.size}|${comboLabel(v)}`;
        const g = groups.get(k);
        if (g) g.available += available;
        else
          groups.set(k, {
            size: v.size,
            name: v.name,
            dorsal: v.dorsal,
            patches: v.patches,
            price: suggestedPrice(p, v),
            few: false,
            available,
          });
      }
      if (!groups.size) continue;
      out.push({
        id: p.id,
        team: p.team,
        season: p.season,
        kit: p.kit,
        photoV: p.photoV ?? "",
        options: [...groups.values()]
          .map(({ available, ...o }) => ({ ...o, few: available <= 2 }))
          .sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size) || a.name.localeCompare(b.name)),
      });
    }
    out.sort((a, b) => a.team.localeCompare(b.team, "es") || b.season.localeCompare(a.season));

    return NextResponse.json(
      { products: out },
      { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch {
    return NextResponse.json({ error: "No se pudo cargar el catálogo" }, { status: 500 });
  }
}
