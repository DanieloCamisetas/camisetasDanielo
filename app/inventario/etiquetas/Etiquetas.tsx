"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type InvProduct, type InvVariant, photoSrc, productTitle } from "../../types";
import { sizeOrder } from "../pricing";
import { InvShell, useInv } from "../shell";
import { Thumb, normalize } from "../ui";

type ListData = { products: InvProduct[]; variants: InvVariant[] };

export default function Etiquetas() {
  return (
    <InvShell active="etiquetas">
      <EtiquetasView />
    </InvShell>
  );
}

function EtiquetasView() {
  const { api, flash } = useInv();
  const [data, setData] = useState<ListData | null>(null);
  const [selected, setSelected] = useState<string[]>([]); // camisetas elegidas
  const [copies, setCopies] = useState<Record<string, number>>({}); // fila → nº etiquetas
  const [query, setQuery] = useState("");
  const [svgs, setSvgs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const d = await api<ListData>();
      setData(d);
      const p = new URLSearchParams(window.location.search).get("p");
      if (p && d.products.some((x) => x.id === p)) setSelected([p]);
    } catch (e) {
      flash((e as Error).message, "err");
    }
  }, [api, flash]);

  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map((data?.products ?? []).map((p) => [p.id, p])), [data]);

  const rows = useMemo(
    () =>
      (data?.variants ?? [])
        .filter((v) => selected.includes(v.productId))
        .sort(
          (a, b) =>
            selected.indexOf(a.productId) - selected.indexOf(b.productId) ||
            sizeOrder(a.size) - sizeOrder(b.size) ||
            a.name.localeCompare(b.name),
        ),
    [data, selected],
  );

  const countOf = (v: InvVariant) => copies[v.id] ?? v.qty; // por defecto, una por unidad

  // QR de cada fila elegida: "inv:<id de la fila>" (lo entiende el escáner de Contar).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const v of rows) {
        next[v.id] =
          svgs[v.id] ??
          (await QRCode.toString(`inv:${v.id}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" }));
      }
      if (!cancelled) setSvgs(next);
    })();
    return () => {
      cancelled = true;
    };
    // svgs se usa como caché; no debe relanzar el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const labels = rows.flatMap((v) => Array.from({ length: countOf(v) }, (_, i) => ({ v, i })));

  const products = useMemo(() => {
    const q = normalize(query.trim());
    const withStock = new Set((data?.variants ?? []).map((v) => v.productId));
    return (data?.products ?? [])
      .filter((p) => withStock.has(p.id))
      .filter((p) => !q || normalize(productTitle(p)).includes(q))
      .reverse();
  }, [data, query]);

  if (!data) return <p className="p-6 text-center text-sm text-zinc-500">Cargando…</p>;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4 print:m-0 print:block print:max-w-none print:p-0">
      <div className="flex flex-col gap-4 print:hidden">
        <p className="text-sm text-zinc-600">
          Imprime una etiqueta QR por camiseta y pégala en la bolsa. Al escanearla desde{" "}
          <b>Contar → Escanear</b> se abre su fila exacta (talla, nombre y parches) para venderla
          o reservarla en un toque. Hojas A4 de 21 etiquetas (63,5×38,1 mm, tipo Apli 1273 /
          Avery L7160), o papel normal y recortar.
        </p>

        {/* ---- 1. Camisetas ---- */}
        <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <h2 className="mb-2 font-semibold">1. Elige camisetas</h2>
          <input
            className="input mb-2"
            placeholder="Buscar equipo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
            {products.map((p) => {
              const on = selected.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))
                    }
                    className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left ${
                      on ? "border-amber-500 bg-amber-50" : "border-zinc-200"
                    }`}
                  >
                    <span className="w-5 text-center">{on ? "✅" : "⬜"}</span>
                    <Thumb src={photoSrc(p)} size="h-9 w-9" />
                    <span className="truncate text-sm font-medium">{productTitle(p)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---- 2. Cuántas ---- */}
        {rows.length ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
            <h2 className="mb-2 font-semibold">2. ¿Cuántas de cada?</h2>
            <ul className="flex flex-col divide-y divide-zinc-100">
              {rows.map((v) => (
                <li key={v.id} className="flex items-center gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {byId.get(v.productId)?.team} · {v.size}
                      {v.name || v.dorsal ? ` · ${[v.name, v.dorsal].filter(Boolean).join(" ")}` : ""}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {v.patches.join(" + ") || "Sin parche"} · {v.qty} en stock
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCopies((c) => ({ ...c, [v.id]: Math.max(0, countOf(v) - 1) }))}
                    className="h-9 w-9 rounded-md border border-zinc-300 text-lg"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-bold">{countOf(v)}</span>
                  <button
                    type="button"
                    onClick={() => setCopies((c) => ({ ...c, [v.id]: countOf(v) + 1 }))}
                    className="h-9 w-9 rounded-md border border-zinc-300 text-lg"
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {labels.length ? (
          <button
            type="button"
            onClick={() => window.print()}
            className="sticky bottom-4 z-10 rounded-xl bg-zinc-900 py-4 text-base font-semibold text-white shadow-lg"
          >
            🖨️ Imprimir {labels.length} {labels.length === 1 ? "etiqueta" : "etiquetas"} (
            {Math.ceil(labels.length / 21)} {Math.ceil(labels.length / 21) === 1 ? "hoja" : "hojas"})
          </button>
        ) : null}

        {labels.length ? <p className="eyebrow">Vista previa</p> : null}
      </div>

      {/* ---- Hoja de etiquetas (lo único que se imprime) ---- */}
      {labels.length ? (
        <div className="overflow-x-auto print:overflow-visible">
          <div className="label-sheet">
            {labels.map(({ v, i }) => {
              const p = byId.get(v.productId);
              return (
                <div key={`${v.id}-${i}`} className="label">
                  <span dangerouslySetInnerHTML={{ __html: svgs[v.id] ?? "" }} />
                  <div style={{ minWidth: 0, lineHeight: 1.15 }}>
                    <div style={{ fontWeight: 700, fontSize: "11pt" }}>{p?.team}</div>
                    <div style={{ fontSize: "8pt" }}>{[p?.kit, p?.season].filter(Boolean).join(" · ")}</div>
                    <div style={{ fontWeight: 800, fontSize: "18pt", marginTop: "1mm" }}>{v.size}</div>
                    {v.name || v.dorsal ? (
                      <div style={{ fontWeight: 700, fontSize: "9pt" }}>
                        {[v.name, v.dorsal].filter(Boolean).join(" ")}
                      </div>
                    ) : null}
                    {v.patches.length ? (
                      <div style={{ fontSize: "7pt" }}>{v.patches.join(" + ")}</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </main>
  );
}
