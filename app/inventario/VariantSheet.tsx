"use client";

import Link from "next/link";
import { useState } from "react";
import { type InvProduct, type InvReservation, type InvVariant, comboLabel, productTitle } from "../types";
import { euros, suggestedPrice } from "./pricing";
import { Field, Sheet, Thumb } from "./ui";

type Mode = { kind: "menu" } | { kind: "sell"; reservation?: InvReservation } | { kind: "reserve" };

type Props = {
  variant: InvVariant;
  product: InvProduct;
  photo: string;
  reservations: InvReservation[]; // activas de esta variante
  onClose: () => void;
  onCountMore: () => void;
  onSell: (price: string, customer: string, reservationId?: string) => Promise<boolean>;
  onReserve: (customer: string, until: string, note: string) => Promise<boolean>;
  onCancelReservation: (r: InvReservation) => Promise<void>;
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** Acciones sobre una fila del inventario: vender, reservar, seguir contando… */
export default function VariantSheet({
  variant: v,
  product: p,
  photo,
  reservations,
  onClose,
  onCountMore,
  onSell,
  onReserve,
  onCancelReservation,
}: Props) {
  const [mode, setMode] = useState<Mode>({ kind: "menu" });
  const [busy, setBusy] = useState(false);
  const suggested = suggestedPrice(p, v);
  const [price, setPrice] = useState(suggested ? String(suggested) : "");
  const [customer, setCustomer] = useState("");
  const [until, setUntil] = useState(inDays(7));
  const [note, setNote] = useState("");

  const available = v.qty - reservations.length;

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true);
    try {
      const ok = await fn();
      if (ok !== false) setMode({ kind: "menu" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <Thumb src={photo} size="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{productTitle(p)}</p>
          <p className="text-lg font-bold">
            {v.size} · {comboLabel(v)}
          </p>
          {v.location ? <p className="text-xs text-zinc-500">📍 {v.location}</p> : null}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <Box label="En stock" value={v.qty} />
        <Box label="Reservadas" value={reservations.length} />
        <Box label="Libres" value={available} strong />
      </div>

      {mode.kind === "menu" ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={available <= 0}
              onClick={() => {
                setCustomer("");
                setMode({ kind: "sell" });
              }}
              className="rounded-lg bg-emerald-600 py-3.5 font-semibold text-white disabled:opacity-40"
            >
              💶 Vender 1
            </button>
            <button
              type="button"
              disabled={available <= 0}
              onClick={() => {
                setCustomer("");
                setNote("");
                setMode({ kind: "reserve" });
              }}
              className="rounded-lg bg-sky-600 py-3.5 font-semibold text-white disabled:opacity-40"
            >
              📌 Reservar 1
            </button>
          </div>
          <button
            type="button"
            onClick={onCountMore}
            className="rounded-lg border border-zinc-300 py-3 text-sm font-semibold text-zinc-700"
          >
            ➕ Seguir contando esta combinación
          </button>
          <Link
            href={`/inventario/etiquetas?p=${encodeURIComponent(p.id)}`}
            className="rounded-lg border border-zinc-300 py-3 text-center text-sm font-semibold text-zinc-700"
          >
            🏷️ Imprimir etiquetas QR
          </Link>

          {reservations.length ? (
            <div className="mt-2">
              <p className="eyebrow mb-1.5">Reservas</p>
              <ul className="flex flex-col gap-1.5">
                {reservations.map((r) => {
                  const late = r.until && r.until < today();
                  return (
                    <li key={r.id} className="rounded-lg border border-zinc-200 p-2">
                      <p className="font-semibold">{r.customer}</p>
                      <p className={`text-xs ${late ? "font-semibold text-red-600" : "text-zinc-500"}`}>
                        {r.until ? `${late ? "⚠️ Caducó" : "Hasta"} el ${r.until}` : "Sin fecha"}
                        {r.user ? ` · por ${r.user}` : ""}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCustomer(r.customer);
                            setMode({ kind: "sell", reservation: r });
                          }}
                          className="rounded-md bg-emerald-600 py-2 text-sm font-semibold text-white"
                        >
                          Vendida
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`¿Cancelar la reserva de ${r.customer}?`))
                              run(() => onCancelReservation(r));
                          }}
                          className="rounded-md border border-zinc-300 py-2 text-sm font-semibold text-zinc-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode.kind === "sell" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => onSell(price, customer, mode.reservation?.id));
          }}
        >
          <h3 className="font-semibold">
            Vender 1{mode.reservation ? ` (reserva de ${mode.reservation.customer})` : ""}
          </h3>
          <Field label="Precio de venta (€)">
            <input
              className="input text-lg font-semibold"
              inputMode="decimal"
              autoFocus
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            {suggested ? (
              <span className="text-xs text-zinc-500">
                Sugerido {euros(suggested)} (PVP {p.price}€ + nombre/parches)
              </span>
            ) : (
              <span className="text-xs text-zinc-500">
                Pon el PVP en la camiseta para que salga solo.
              </span>
            )}
          </Field>
          <Field label="Cliente (opcional)">
            <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </Field>
          <FormButtons busy={busy} onBack={() => setMode({ kind: "menu" })} label="Confirmar venta" tone="sell" />
        </form>
      ) : null}

      {mode.kind === "reserve" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (customer.trim()) run(() => onReserve(customer, until, note));
          }}
        >
          <h3 className="font-semibold">Reservar 1</h3>
          <Field label="Para quién">
            <input
              className="input"
              autoFocus
              placeholder="Nombre del cliente"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </Field>
          <Field label="Hasta">
            <div className="flex gap-1.5">
              {[3, 7, 14].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setUntil(inDays(d))}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    until === inDays(d) ? "border-sky-500 bg-sky-50" : "border-zinc-300"
                  }`}
                >
                  {d} días
                </button>
              ))}
            </div>
            <input className="input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <Field label="Nota (opcional)">
            <input
              className="input"
              placeholder="Ej: paga el viernes"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <FormButtons
            busy={busy || !customer.trim()}
            onBack={() => setMode({ kind: "menu" })}
            label="Reservar"
            tone="reserve"
          />
        </form>
      ) : null}
    </Sheet>
  );
}

function Box({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-lg py-2 ${strong ? "bg-amber-50" : "bg-zinc-50"}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="eyebrow !text-[9px]">{label}</p>
    </div>
  );
}

function FormButtons({
  busy,
  onBack,
  label,
  tone,
}: {
  busy: boolean;
  onBack: () => void;
  label: string;
  tone: "sell" | "reserve";
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-2">
      <button
        type="button"
        onClick={onBack}
        className="rounded-lg border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700"
      >
        Atrás
      </button>
      <button
        disabled={busy}
        className={`rounded-lg py-3 font-semibold text-white disabled:opacity-40 ${
          tone === "sell" ? "bg-emerald-600" : "bg-sky-600"
        }`}
      >
        {label}
      </button>
    </div>
  );
}
