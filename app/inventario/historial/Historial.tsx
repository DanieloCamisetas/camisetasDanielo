"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InvMovement } from "../../types";
import { euros } from "../pricing";
import { InvShell, useInv } from "../shell";
import { Chip, ChipRow } from "../ui";

export default function Historial() {
  return (
    <InvShell active="historial">
      <HistorialView />
    </InvShell>
  );
}

type Kind = "all" | "count" | "sale" | "reserve";

/** Movimientos seguidos de la misma persona sobre la misma fila se agrupan: «+12». */
type Group = InvMovement & { total: number; from: string };

const KIND_LABEL: Record<Kind, string> = {
  all: "Todo",
  count: "Recuento",
  sale: "Ventas",
  reserve: "Reservas",
};

function describe(g: Group) {
  switch (g.kind) {
    case "count":
      return { icon: g.total > 0 ? "➕" : "➖", text: `${g.total > 0 ? "+" : ""}${g.total}`, tone: g.total > 0 ? "text-emerald-700" : "text-red-600" };
    case "sale":
      return g.total < 0
        ? { icon: "💶", text: `Venta${g.total < -1 ? ` ×${-g.total}` : ""}`, tone: "text-emerald-700" }
        : { icon: "↩️", text: "Devolución", tone: "text-amber-700" };
    case "reserve":
      return { icon: "📌", text: "Reserva", tone: "text-sky-700" };
    case "unreserve":
      return { icon: "✖️", text: "Reserva cancelada", tone: "text-zinc-500" };
  }
}

export function groupMovements(ms: InvMovement[]): Group[] {
  const out: Group[] = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    const close = last && new Date(last.from).getTime() - new Date(m.at).getTime() < 15 * 60_000;
    if (
      last &&
      close &&
      m.kind === "count" &&
      last.kind === "count" &&
      last.user === m.user &&
      last.variantId === m.variantId
    ) {
      last.total += m.delta;
      last.from = m.at;
    } else {
      out.push({ ...m, total: m.delta, from: m.at });
    }
  }
  return out.filter((g) => g.kind !== "count" || g.total !== 0);
}

function HistorialView() {
  const { api, flash } = useInv();
  const [movements, setMovements] = useState<InvMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [kind, setKind] = useState<Kind>("all");
  const [who, setWho] = useState("");

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      try {
        const { movements: page } = await api<{ movements: InvMovement[] }>(
          undefined,
          `view=history${before ? `&before=${before}` : ""}`,
        );
        setMovements((ms) => (before ? [...ms, ...page] : page));
        setMore(page.length >= 200);
      } catch (e) {
        flash((e as Error).message, "err");
      } finally {
        setLoading(false);
      }
    },
    [api, flash],
  );

  useEffect(() => {
    load();
  }, [load]);

  const users = useMemo(
    () => [...new Set(movements.map((m) => m.user).filter(Boolean))].sort(),
    [movements],
  );

  const groups = useMemo(() => {
    const filtered = movements.filter(
      (m) =>
        (!who || m.user === who) &&
        (kind === "all" ||
          m.kind === kind ||
          (kind === "reserve" && m.kind === "unreserve")),
    );
    return groupMovements(filtered);
  }, [movements, kind, who]);

  // Separadores por día.
  let lastDay = "";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pt-4">
      <ChipRow>
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <Chip key={k} on={kind === k} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </Chip>
        ))}
      </ChipRow>
      {users.length > 1 ? (
        <ChipRow>
          <Chip on={!who} onClick={() => setWho("")}>
            Todos
          </Chip>
          {users.map((u) => (
            <Chip key={u} on={who === u} onClick={() => setWho(who === u ? "" : u)}>
              👤 {u}
            </Chip>
          ))}
        </ChipRow>
      ) : null}

      <ul className="flex flex-col">
        {groups.map((g) => {
          const day = new Date(g.at).toLocaleDateString("es-ES", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
          const header = day !== lastDay ? day : null;
          lastDay = day;
          const d = describe(g);
          return (
            <li key={g.id}>
              {header ? (
                <p className="eyebrow mt-3 mb-1 capitalize first:mt-0">{header}</p>
              ) : null}
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2">
                <span className="text-lg">{d.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{g.productTitle || "—"}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {g.label}
                    {g.customer ? ` · ${g.customer}` : ""}
                    {g.unitPrice != null ? ` · ${euros(g.unitPrice, 2)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${d.tone}`}>{d.text}</p>
                  <p className="text-[11px] text-zinc-400">
                    {new Date(g.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    {g.user ? ` · ${g.user}` : ""}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {!loading && !groups.length ? (
        <p className="p-6 text-center text-sm text-zinc-500">Todavía no hay movimientos.</p>
      ) : null}

      {more && movements.length ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => load(movements[movements.length - 1].id)}
          className="rounded-lg border border-zinc-300 bg-white py-3 text-sm font-semibold text-zinc-700 disabled:opacity-40"
        >
          {loading ? "Cargando…" : "Ver más antiguos"}
        </button>
      ) : null}
    </main>
  );
}
