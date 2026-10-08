"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { suggestedPrice, sizeOrder } from "./inventario/pricing";
import { Sheet, Thumb, normalize } from "./inventario/ui";
import {
  type InvProduct,
  type InvReservation,
  type InvVariant,
  comboLabel,
  photoSrc,
  productTitle,
} from "./types";

type ListData = { products: InvProduct[]; variants: InvVariant[]; reservations: InvReservation[] };

const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};

/** Llamada al inventario con el PIN guardado en este móvil. */
export async function inventoryApi<T>(body?: object): Promise<T> {
  const res = await fetch("/api/inventario", {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      "x-pin": read("inv-pin"),
      "x-user": encodeURIComponent(read("inv-user")),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data as T;
}

type Props = {
  onPick: (product: InvProduct, variant: InvVariant, price: number) => void;
  onClose: () => void;
};

/** Hoja para añadir al pedido camisetas que ya están en el inventario. */
export default function StockPicker({ onPick, onClose }: Props) {
  const [data, setData] = useState<ListData | null>(null);
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await inventoryApi<ListData>());
      setNeedPin(false);
    } catch (e) {
      if ((e as { status?: number }).status === 401) setNeedPin(true);
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reserved = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.reservations ?? []) m.set(r.variantId, (m.get(r.variantId) ?? 0) + 1);
    return m;
  }, [data]);

  const free = (v: InvVariant) => v.qty - (reserved.get(v.id) ?? 0);

  const products = useMemo(() => {
    const q = normalize(query.trim());
    const withStock = new Set((data?.variants ?? []).filter((v) => free(v) > 0).map((v) => v.productId));
    return (data?.products ?? [])
      .filter((p) => withStock.has(p.id))
      .filter(
        (p) =>
          !q ||
          normalize(productTitle(p)).includes(q) ||
          (data?.variants ?? []).some((v) => v.productId === p.id && normalize(v.name).includes(q)),
      )
      .reverse();
    // free depende de reserved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, reserved]);

  return (
    <Sheet onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">📦 Añadir desde el inventario</h3>
        {added ? <span className="text-sm font-semibold text-emerald-700">+{added} añadidas</span> : null}
      </div>

      {needPin ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              localStorage.setItem("inv-pin", pin);
            } catch {}
            load();
          }}
        >
          <p className="text-sm text-zinc-600">Introduce el PIN del inventario (solo la primera vez).</p>
          <input
            className="input text-center tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <button className="rounded-lg bg-zinc-900 py-3 font-semibold text-white">Entrar</button>
        </form>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="text-sm text-zinc-500">Cargando inventario…</p>
      ) : (
        <>
          <input
            className="input mb-2"
            placeholder="Buscar equipo o jugador…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
            {products.map((p) => {
              const rows = data.variants
                .filter((v) => v.productId === p.id && free(v) > 0)
                .sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size));
              const isOpen = openId === p.id;
              return (
                <li key={p.id} className="rounded-lg border border-zinc-200">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : p.id)}
                    className="flex w-full items-center gap-2 p-1.5 text-left"
                  >
                    <Thumb src={photoSrc(p)} size="h-11 w-11" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{productTitle(p)}</span>
                    <span className="px-1 text-sm text-zinc-500">
                      {rows.reduce((a, v) => a + free(v), 0)} {isOpen ? "▴" : "▾"}
                    </span>
                  </button>
                  {isOpen ? (
                    <ul className="border-t border-zinc-100">
                      {rows.map((v) => (
                        <li key={v.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onPick(p, v, suggestedPrice(p, v));
                              setAdded((n) => n + 1);
                            }}
                            className="flex w-full items-center gap-2 px-2.5 py-2 text-left active:bg-amber-50"
                          >
                            <span className="w-10 font-bold">{v.size}</span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {comboLabel(v)}
                              {v.location ? <span className="text-zinc-400"> · {v.location}</span> : null}
                            </span>
                            <span className="text-xs text-zinc-500">{free(v)} libres</span>
                            <span className="text-lg text-emerald-600">＋</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
            {!products.length ? (
              <li className="p-4 text-center text-sm text-zinc-500">No hay nada disponible.</li>
            ) : null}
          </ul>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-lg bg-zinc-900 py-3 font-semibold text-white"
          >
            Listo
          </button>
        </>
      )}
    </Sheet>
  );
}
