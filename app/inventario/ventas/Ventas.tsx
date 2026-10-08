"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LOW_STOCK, STALE_DAYS } from "../../config";
import { type InvProduct, type InvReservation, type InvVariant, photoSrc, productTitle } from "../../types";
import { euros } from "../pricing";
import { InvShell, useInv } from "../shell";
import type { InvStats } from "../store";
import { Section, Stat, Thumb, fmtDate } from "../ui";

type ListData = { products: InvProduct[]; variants: InvVariant[]; reservations: InvReservation[] };

const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
};

export default function Ventas() {
  return (
    <InvShell active="ventas">
      <VentasView />
    </InvShell>
  );
}

function VentasView() {
  const { api, flash } = useInv();
  const [stats, setStats] = useState<InvStats | null>(null);
  const [list, setList] = useState<ListData | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api<InvStats>(undefined, "view=stats"), api<ListData>()]);
      setStats(s);
      setList(l);
    } catch (e) {
      flash((e as Error).message, "err");
    }
  }, [api, flash]);

  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map((list?.products ?? []).map((p) => [p.id, p])), [list]);
  const variantById = useMemo(() => new Map((list?.variants ?? []).map((v) => [v.id, v])), [list]);

  if (!stats || !list) return <p className="p-6 text-center text-sm text-zinc-500">Cargando…</p>;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const m = stats.months.find((x) => x.month === thisMonth);
  const today = new Date().toISOString().slice(0, 10);
  const reservations = [...list.reservations].sort((a, b) =>
    (a.until || "9999").localeCompare(b.until || "9999"),
  );

  const returnSale = async (id: string) => {
    if (!confirm("¿Devolver esta venta? La camiseta vuelve al stock y se resta de las ventas.")) return;
    try {
      await api({ action: "returnSale", movementId: id });
      flash("Devuelta al stock");
      load();
    } catch (e) {
      flash((e as Error).message, "err");
    }
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4">
      {/* ---------------- Este mes ---------------- */}
      <div>
        <p className="eyebrow mb-1.5">Este mes · {monthName(thisMonth)}</p>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Vendidas" value={m?.units ?? 0} />
          <Stat label="Ingresos" value={euros(m?.revenue ?? 0)} />
          <Stat
            label="Beneficio"
            value={euros((m?.revenue ?? 0) - (m?.cost ?? 0))}
            tone={(m?.revenue ?? 0) - (m?.cost ?? 0) >= 0 ? "good" : "bad"}
          />
        </div>
        {m?.incomplete ? (
          <p className="mt-1 text-xs text-amber-700">
            ⚠️ {m.incomplete} ventas sin precio o sin coste: el beneficio es aproximado. Pon coste y
            PVP en las camisetas.
          </p>
        ) : null}
      </div>

      {/* ---------------- Reservas ---------------- */}
      <Section
        title={`📌 Reservas activas (${reservations.length})`}
        hint="Unidades apartadas para clientes. Toca para venderla o cancelarla."
      >
        {reservations.length ? (
          <ul className="flex flex-col divide-y divide-zinc-100">
            {reservations.map((r) => {
              const p = byId.get(r.productId);
              const v = variantById.get(r.variantId);
              const late = r.until && r.until < today;
              return (
                <li key={r.id}>
                  <Link
                    href={`/inventario?v=${encodeURIComponent(r.variantId)}`}
                    className="flex items-center gap-2 py-2"
                  >
                    <Thumb src={p ? photoSrc(p) : ""} size="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.customer}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {p ? productTitle(p) : "—"}
                        {v ? ` · ${v.size}${v.name ? ` ${v.name} ${v.dorsal}` : ""}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold ${late ? "text-red-600" : "text-zinc-500"}`}>
                      {r.until ? (late ? `⚠️ ${r.until}` : r.until) : "sin fecha"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No hay reservas.</p>
        )}
      </Section>

      {/* ---------------- Reponer ---------------- */}
      <Section
        title="🔁 Reponer"
        hint={`Se han vendido en los últimos 30 días y quedan ${LOW_STOCK} o menos libres.`}
      >
        {stats.lowStock.length ? (
          <ul className="flex flex-col divide-y divide-zinc-100">
            {stats.lowStock.map((x) => {
              const p = byId.get(x.productId);
              return (
                <ProductRow key={x.productId} product={p}>
                  <span className={`text-sm font-bold ${x.available ? "text-amber-700" : "text-red-600"}`}>
                    {x.available ? `quedan ${x.available}` : "agotada"}
                  </span>
                  <span className="block text-[11px] text-zinc-500">{x.sold} vendidas/30d</span>
                </ProductRow>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nada urgente que reponer.</p>
        )}
      </Section>

      {/* ---------------- Lo más vendido ---------------- */}
      <Section title="🏆 Lo más vendido" hint="Últimos 90 días.">
        {stats.top.length ? (
          <ul className="flex flex-col divide-y divide-zinc-100">
            {stats.top.map((x, i) => (
              <ProductRow key={x.productId} product={byId.get(x.productId)} fallback={x.title} rank={i + 1}>
                <span className="text-sm font-bold">{x.units} uds</span>
                {x.revenue ? (
                  <span className="block text-[11px] text-zinc-500">{euros(x.revenue)}</span>
                ) : null}
              </ProductRow>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            Aún no hay ventas. Se registran desde Contar → toca una fila → «Vender 1», o desde un
            pedido con camisetas del inventario.
          </p>
        )}
      </Section>

      {/* ---------------- Paradas ---------------- */}
      <Section
        title="🐢 Paradas"
        hint={`Con stock y sin venderse en ${STALE_DAYS} días o más: candidatas a oferta.`}
      >
        {stats.stale.length ? (
          <ul className="flex flex-col divide-y divide-zinc-100">
            {stats.stale.map((x) => (
              <ProductRow key={x.productId} product={byId.get(x.productId)}>
                <span className="text-sm font-bold">{x.stock} uds</span>
                <span className="block text-[11px] text-zinc-500">desde {fmtDate(x.since, false)}</span>
              </ProductRow>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Ninguna lleva tanto tiempo parada.</p>
        )}
      </Section>

      {/* ---------------- Por meses ---------------- */}
      {stats.months.length ? (
        <Section title="📅 Por meses">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-zinc-500 uppercase">
                <th className="py-1">Mes</th>
                <th className="py-1 text-right">Uds</th>
                <th className="py-1 text-right">Ingresos</th>
                <th className="py-1 text-right">Beneficio</th>
              </tr>
            </thead>
            <tbody>
              {stats.months.map((x) => (
                <tr key={x.month} className="border-t border-zinc-100">
                  <td className="py-1.5 capitalize">{monthName(x.month)}</td>
                  <td className="py-1.5 text-right">{x.units}</td>
                  <td className="py-1.5 text-right">{euros(x.revenue)}</td>
                  <td className="py-1.5 text-right font-semibold">{euros(x.revenue - x.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {/* ---------------- Últimas ventas ---------------- */}
      <Section title="🧾 Últimas ventas" hint="Si una venta fue un error o te la devuelven, pulsa Devolver.">
        {stats.recent.length ? (
          <ul className="flex flex-col divide-y divide-zinc-100">
            {stats.recent.map((s) => (
              <li key={s.id} className={`flex items-center gap-2 py-2 ${s.returned ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.productTitle || "—"}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {s.label}
                    {s.customer ? ` · ${s.customer}` : ""} · {fmtDate(s.at)}
                    {s.user ? ` · ${s.user}` : ""}
                  </p>
                </div>
                <span className="text-sm font-bold">
                  {s.unitPrice != null ? euros(s.unitPrice, 2) : "—"}
                </span>
                {s.returned ? (
                  <span className="text-[11px] text-zinc-500">devuelta</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => returnSale(s.id)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-600"
                  >
                    Devolver
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Todavía no hay ventas.</p>
        )}
      </Section>
    </main>
  );
}

function ProductRow({
  product,
  fallback,
  rank,
  children,
}: {
  product?: InvProduct;
  fallback?: string;
  rank?: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 py-2">
      {rank ? <span className="w-5 text-center text-sm font-bold text-zinc-400">{rank}</span> : null}
      <Thumb src={product ? photoSrc(product) : ""} size="h-10 w-10" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
        {product ? productTitle(product) : fallback || "Camiseta borrada"}
      </p>
      <div className="text-right">{children}</div>
    </li>
  );
}
