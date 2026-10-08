"use client";

import { useEffect, useMemo, useState } from "react";
import { CATALOG_MESSAGE, CATALOG_TITLE, SIZES, WHATSAPP_NUMBER } from "../config";
import { euros } from "../inventario/pricing";
import { Chip, ChipRow, Sheet, Thumb, normalize } from "../inventario/ui";
import { type CatalogOption, type CatalogProduct, comboLabel, photoSrc } from "../types";

type CartItem = { key: string; product: CatalogProduct; option: CatalogOption };

const optionKey = (p: CatalogProduct, o: CatalogOption) =>
  `${p.id}|${o.size}|${comboLabel(o)}`;

const fromPrice = (p: CatalogProduct) => {
  const prices = p.options.map((o) => o.price).filter(Boolean);
  return prices.length ? Math.min(...prices) : 0;
};

const photoOf = (p: CatalogProduct) => photoSrc({ id: p.id, photo: "", photoV: p.photoV });

/** Catálogo público: lo que hay disponible, para elegir y pedir por WhatsApp. */
export default function Catalogo() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("");
  const [size, setSize] = useState("");
  const [open, setOpen] = useState<CatalogProduct | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    fetch("/api/catalogo")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setProducts(d.products))
      .catch(() => setError(true));
  }, []);

  const teams = useMemo(
    () => [...new Set((products ?? []).map((p) => p.team))].sort((a, b) => a.localeCompare(b, "es")),
    [products],
  );
  const sizes = useMemo(() => {
    const present = new Set((products ?? []).flatMap((p) => p.options.map((o) => o.size)));
    return SIZES.filter((s) => present.has(s));
  }, [products]);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return (products ?? []).filter(
      (p) =>
        (!team || p.team === team) &&
        (!size || p.options.some((o) => o.size === size)) &&
        (!q ||
          normalize(`${p.team} ${p.kit} ${p.season}`).includes(q) ||
          p.options.some((o) => normalize(o.name).includes(q))),
    );
  }, [products, query, team, size]);

  const inCart = (key: string) => cart.some((c) => c.key === key);
  const toggle = (product: CatalogProduct, option: CatalogOption) => {
    const key = optionKey(product, option);
    setCart((c) => (inCart(key) ? c.filter((x) => x.key !== key) : [...c, { key, product, option }]));
  };

  const total = cart.reduce((a, c) => a + c.option.price, 0);
  const allPriced = cart.every((c) => c.option.price);

  const whatsapp = () => {
    const lines = cart.map(
      (c, i) =>
        `${i + 1}. ${c.product.team} ${c.product.kit} ${c.product.season} — Talla ${c.option.size}` +
        (comboLabel(c.option) !== "Lisa" ? ` · ${comboLabel(c.option)}` : "") +
        (c.option.price ? ` (${euros(c.option.price)})` : ""),
    );
    const text = [CATALOG_MESSAGE, "", ...lines, "", allPriced && total ? `Total: ${euros(total)}` : ""]
      .join("\n")
      .trim();
    const number = WHATSAPP_NUMBER.replace(/\D/g, "");
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <h1 className="text-lg font-bold text-zinc-900">⚽ {CATALOG_TITLE}</h1>
          <p className="text-xs text-zinc-500">
            Toca una camiseta, elige talla y pídela por WhatsApp.
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-4">
        <input
          className="input"
          placeholder="Buscar equipo o jugador…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {teams.length > 1 ? (
          <ChipRow>
            <Chip on={!team} onClick={() => setTeam("")}>
              Todos
            </Chip>
            {teams.map((t) => (
              <Chip key={t} on={team === t} onClick={() => setTeam(team === t ? "" : t)}>
                {t}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
        {sizes.length > 1 ? (
          <ChipRow>
            <Chip on={!size} onClick={() => setSize("")}>
              Todas las tallas
            </Chip>
            {sizes.map((s) => (
              <Chip key={s} on={size === s} onClick={() => setSize(size === s ? "" : s)}>
                {s}
              </Chip>
            ))}
          </ChipRow>
        ) : null}

        {error ? (
          <p className="p-6 text-center text-sm text-red-600">No se pudo cargar el catálogo.</p>
        ) : !products ? (
          <p className="p-6 text-center text-sm text-zinc-500">Cargando…</p>
        ) : !visible.length ? (
          <p className="p-6 text-center text-sm text-zinc-500">No hay camisetas con esos filtros.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((p) => {
              const price = fromPrice(p);
              const sizesHere = [...new Set(p.options.map((o) => o.size))];
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(p)}
                    className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex aspect-square w-full items-center justify-center bg-zinc-50">
                      {photoOf(p) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoOf(p)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-4xl text-zinc-300">👕</span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 p-2">
                      <p className="truncate text-sm font-semibold">{p.team}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {[p.kit, p.season].filter(Boolean).join(" · ")}
                      </p>
                      <p className="truncate text-[11px] text-zinc-600">{sizesHere.join(" · ")}</p>
                      {price ? (
                        <p className="mt-auto pt-1 text-sm font-bold">
                          {p.options.some((o) => o.price !== price) ? "Desde " : ""}
                          {euros(price)}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* ---------------- Detalle: elegir talla ---------------- */}
      {open ? (
        <Sheet onClose={() => setOpen(null)}>
          <div className="mb-3 flex items-center gap-3">
            <Thumb src={photoOf(open)} size="h-24 w-24" />
            <div>
              <p className="text-lg font-bold">{open.team}</p>
              <p className="text-sm text-zinc-600">{[open.kit, open.season].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <p className="eyebrow mb-1.5">Elige (puedes marcar varias)</p>
          <ul className="flex flex-col gap-1.5">
            {open.options.map((o) => {
              const key = optionKey(open, o);
              const on = inCart(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggle(open, o)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left ${
                      on ? "border-emerald-500 bg-emerald-50" : "border-zinc-200"
                    }`}
                  >
                    <span className="w-12 text-center text-lg font-bold">{o.size}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{comboLabel(o)}</span>
                      {o.few ? <span className="text-[11px] font-semibold text-red-600">¡Últimas!</span> : null}
                    </span>
                    {o.price ? <span className="font-bold">{euros(o.price)}</span> : null}
                    <span className="text-lg">{on ? "✅" : "＋"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="mt-3 w-full rounded-lg bg-zinc-900 py-3 font-semibold text-white"
          >
            Listo
          </button>
        </Sheet>
      ) : null}

      {/* ---------------- Carrito ---------------- */}
      {showCart && cart.length ? (
        <Sheet onClose={() => setShowCart(false)}>
          <p className="mb-2 text-base font-semibold">Tu selección</p>
          <ul className="mb-3 flex flex-col divide-y divide-zinc-100">
            {cart.map((c) => (
              <li key={c.key} className="flex items-center gap-2 py-2">
                <Thumb src={photoOf(c.product)} size="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {c.product.team} · {c.option.size}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {[c.product.kit, c.product.season].join(" · ")} · {comboLabel(c.option)}
                  </p>
                </div>
                {c.option.price ? <span className="text-sm font-bold">{euros(c.option.price)}</span> : null}
                <button
                  type="button"
                  onClick={() => toggle(c.product, c.option)}
                  className="px-2 text-zinc-400"
                  aria-label="Quitar"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={whatsapp}
            className="w-full rounded-lg bg-emerald-600 py-3.5 font-semibold text-white"
          >
            Pedir por WhatsApp
          </button>
        </Sheet>
      ) : null}

      {cart.length ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setShowCart(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white"
          >
            <span>
              🛒 {cart.length} {cart.length === 1 ? "camiseta" : "camisetas"}
            </span>
            <span>{allPriced && total ? euros(total) : "Ver y pedir"} →</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
