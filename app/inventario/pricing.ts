import { PRICE_EXTRA_NAME, PRICE_EXTRA_PATCH, SIZES } from "../config";
import type { InvProduct, InvVariantKey } from "../types";

/** "12", "12,50 €" → 12 / 12.5; vacío o raro → 0. */
export const num = (v: string | number | null | undefined) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const euros = (n: number, decimals = 0) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/** PVP de la camiseta + suplementos por nombre/dorsal y parches. 0 = sin precio. */
export function suggestedPrice(
  product: Pick<InvProduct, "price">,
  v: Pick<InvVariantKey, "name" | "dorsal" | "patches">,
) {
  const base = num(product.price);
  if (!base) return 0;
  return (
    base +
    (v.name.trim() || v.dorsal.trim() ? PRICE_EXTRA_NAME : 0) +
    v.patches.length * PRICE_EXTRA_PATCH
  );
}

export const sizeOrder = (s: string) => {
  const i = SIZES.indexOf(s);
  return i < 0 ? 999 : i;
};
