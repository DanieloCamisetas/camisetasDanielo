"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INV_EXTRA_PATCHES, INV_LOCATIONS, INV_TEAMS, SIZES } from "../config";
import {
  type InvProduct,
  type InvReservation,
  type InvVariant,
  type InvVariantKey,
  type PatchOption,
  comboLabel,
  normalizeVariantKey,
  photoSrc,
  productTitle,
  variantId,
} from "../types";
import { euros, num, sizeOrder } from "./pricing";
import ProductForm, { type Draft, emptyProduct } from "./ProductForm";
import Scanner from "./Scanner";
import { ApiError, InvShell, isOffline, useInv } from "./shell";
import { Chip, ChipRow, Sheet, Stat, Th, Thumb, beep, normalize, uid } from "./ui";
import VariantSheet from "./VariantSheet";

const CACHE_KEY = "inv-cache";

/** Personalización activa: se aplica a cada toque de talla. */
type Custom = { name: string; dorsal: string; patches: string[]; location: string };
const emptyCustom: Custom = { name: "", dorsal: "", patches: [], location: "" };

type Undo = { key: InvVariantKey; delta: number };
type ListData = { products: InvProduct[]; variants: InvVariant[]; reservations: InvReservation[] };

const comboKey = (c: Pick<Custom, "name" | "dorsal" | "patches">) =>
  [c.name.trim().toUpperCase(), c.dorsal.trim(), [...c.patches].sort().join("+")].join("|");

export default function Inventory({ patchOptions }: { patchOptions: PatchOption[] }) {
  return (
    <InvShell active="contar">
      <Contar patchOptions={patchOptions} />
    </InvShell>
  );
}

function Contar({ patchOptions }: { patchOptions: PatchOption[] }) {
  const { api, send, flash, queued } = useInv();

  const [products, setProducts] = useState<InvProduct[]>([]);
  const [variants, setVariants] = useState<InvVariant[]>([]);
  const [reservations, setReservations] = useState<InvReservation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [custom, setCustom] = useState<Custom>(emptyCustom);
  const [subtract, setSubtract] = useState(false);
  const [lastOps, setLastOps] = useState<Undo[]>([]);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [editing, setEditing] = useState(false);
  // Para qué se abre el escáner: buscar, rellenar el formulario o asignar a la camiseta activa.
  const [scanMode, setScanMode] = useState<null | "find" | "draft" | "assign">(null);
  const [found, setFound] = useState<{ code: string; ids: string[] } | null>(null);
  const [assignQuery, setAssignQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheetVariant, setSheetVariant] = useState<string | null>(null);

  const pending = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;

  /* ------------------------------- Carga ------------------------------- */

  const hasData = useRef(false);
  const apply = (d: ListData) => {
    hasData.current = true;
    setProducts(d.products);
    setVariants(d.variants);
    setReservations(d.reservations ?? []);
  };

  const refresh = useCallback(async () => {
    try {
      const data = await api<ListData>();
      // No pisar toques que aún viajan al servidor o esperan cobertura.
      if (pending.current === 0 && queuedRef.current === 0) {
        apply(data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {}
      }
    } catch (e) {
      if (isOffline(e)) {
        // Sin cobertura: se muestra lo último que se cargó.
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached && !hasData.current) apply(JSON.parse(cached));
        } catch {}
      } else if (!(e instanceof ApiError && e.status === 401)) {
        flash(e instanceof Error ? e.message : "Error al cargar", "err");
      }
    } finally {
      setLoaded(true);
    }
  }, [api, flash]);

  useEffect(() => {
    refresh();
    // Otros móviles pueden estar contando a la vez: refresco periódico.
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    return () => window.clearInterval(t);
  }, [refresh]);

  /* Enlaces directos: /inventario?v=<fila> abre la fila; ?p=<camiseta> la camiseta. */
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!loaded || deepLinked.current || !products.length) return;
    deepLinked.current = true;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("v");
    const p = params.get("p");
    const variant = v ? variants.find((x) => x.id === v) : undefined;
    if (variant) {
      setCurrentId(variant.productId);
      setSheetVariant(variant.id);
    } else if (p && products.some((x) => x.id === p)) setCurrentId(p);
    if (v || p) window.history.replaceState(null, "", "/inventario");
  }, [loaded, products, variants]);

  /* ----------------------------- Stock ----------------------------- */

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const current = currentId ? (byId.get(currentId) ?? null) : null;

  const applyLocal = (key: InvVariantKey, delta: number) => {
    const k = normalizeVariantKey(key);
    const id = variantId(k);
    setVariants((vs) => {
      const existing = vs.find((v) => v.id === id);
      if (!existing) return delta > 0 ? [...vs, { ...k, id, qty: delta }] : vs;
      return vs
        .map((v) => (v.id === id ? { ...v, qty: Math.max(0, v.qty + delta) } : v))
        .filter((v) => v.qty > 0);
    });
  };

  const titleOf = useCallback(
    (productId: string) => {
      const p = byId.get(productId);
      return p ? productTitle(p) : "";
    },
    [byId],
  );

  const changeStock = async (key: InvVariantKey, delta: number, record = true) => {
    applyLocal(key, delta);
    navigator.vibrate?.(25);
    beep(delta > 0 ? 880 : 440);
    if (record) setLastOps((ops) => [...ops.slice(-49), { key, delta }]);
    pending.current++;
    try {
      await send({
        action: "stock",
        ...key,
        delta,
        opId: uid(),
        productTitle: titleOf(key.productId),
      });
    } catch (e) {
      applyLocal(key, -delta);
      flash(`No se guardó: ${e instanceof Error ? e.message : ""}`, "err");
    } finally {
      pending.current--;
    }
  };

  const keyFor = (size: string): InvVariantKey => ({ productId: currentId ?? "", size, ...custom });
  const qtyOf = (key: InvVariantKey) => variants.find((v) => v.id === variantId(key))?.qty ?? 0;

  const tapSize = (size: string) => {
    if (!current) return;
    const key = keyFor(size);
    if (subtract && !qtyOf(key)) return;
    changeStock(key, subtract ? -1 : 1);
  };

  const undo = () => {
    const op = lastOps[lastOps.length - 1];
    if (!op) return;
    setLastOps((ops) => ops.slice(0, -1));
    changeStock(op.key, -op.delta, false);
    flash(`Deshecho: ${op.delta > 0 ? "+" : ""}${op.delta} talla ${op.key.size}`);
  };

  /* --------------------------- Ventas y reservas --------------------------- */

  const keyOfVariant = (v: InvVariant): InvVariantKey => ({
    productId: v.productId,
    size: v.size,
    name: v.name,
    dorsal: v.dorsal,
    patches: v.patches,
    location: v.location,
  });

  const sell = async (v: InvVariant, price: string, customer: string, reservationId?: string) => {
    try {
      await api({
        action: "sell",
        ...keyOfVariant(v),
        price: price.trim() ? num(price) : "",
        customer,
        reservationId,
        opId: uid(),
        productTitle: titleOf(v.productId),
      });
      applyLocal(keyOfVariant(v), -1);
      if (reservationId) setReservations((rs) => rs.filter((r) => r.id !== reservationId));
      beep(1320);
      flash(`Vendida${price.trim() ? ` por ${euros(num(price), 2)}` : ""} ✔`);
      return true;
    } catch (e) {
      flash(isOffline(e) ? "Sin conexión: la venta no se ha guardado" : (e as Error).message, "err");
      return false;
    }
  };

  const reserveOne = async (v: InvVariant, customer: string, until: string, note: string) => {
    try {
      const { id } = await api<{ id: string }>({
        action: "reserve",
        ...keyOfVariant(v),
        customer,
        until,
        note,
        productTitle: titleOf(v.productId),
      });
      setReservations((rs) => [
        ...rs,
        {
          id,
          variantId: v.id,
          productId: v.productId,
          customer: customer.trim(),
          until,
          note: note.trim(),
          user: "",
          createdAt: new Date().toISOString(),
        },
      ]);
      flash(`Reservada para ${customer.trim()}`);
      return true;
    } catch (e) {
      flash(isOffline(e) ? "Sin conexión: la reserva no se ha guardado" : (e as Error).message, "err");
      return false;
    }
  };

  const cancelReservation = async (r: InvReservation) => {
    try {
      await api({ action: "cancelReservation", id: r.id });
      setReservations((rs) => rs.filter((x) => x.id !== r.id));
      flash("Reserva cancelada");
    } catch (e) {
      flash((e as Error).message, "err");
    }
  };

  /* --------------------------- Productos --------------------------- */

  const select = (id: string) => {
    setCurrentId(id);
    setCustom(emptyCustom);
    setEditing(false);
    setSubtract(false);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const saveDraft = async () => {
    if (!draft || !draft.team.trim()) return;
    const isNew = !draft.id;
    const product: Draft = { ...draft, id: draft.id || uid() };
    setSaving(true);
    try {
      await api({ action: "saveProduct", ...product });
      const source = product.copyPhotoFrom ? byId.get(product.copyPhotoFrom) : undefined;
      const stored: InvProduct = {
        ...product,
        photoV: product.photo ? undefined : (source?.photoV ?? byId.get(product.id)?.photoV),
      };
      delete (stored as Draft).copyPhotoFrom;
      setProducts((ps) =>
        ps.some((p) => p.id === stored.id)
          ? ps.map((p) => (p.id === stored.id ? stored : p))
          : [...ps, stored],
      );
      setDraft(null);
      if (isNew) {
        select(stored.id);
        flash("Creada: ahora toca las tallas");
      } else flash("Camiseta actualizada");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Error al guardar", "err");
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async (p: InvProduct) => {
    const units = variants.filter((v) => v.productId === p.id).reduce((a, v) => a + v.qty, 0);
    if (!confirm(`¿Borrar "${productTitle(p)}" y sus ${units} unidades?`)) return;
    try {
      await api({ action: "deleteProduct", id: p.id });
      setProducts((ps) => ps.filter((x) => x.id !== p.id));
      setVariants((vs) => vs.filter((v) => v.productId !== p.id));
      if (currentId === p.id) setCurrentId(null);
      setDraft(null);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Error al borrar", "err");
    }
  };

  /* ------------------------- Códigos (barras y QR) ------------------------- */

  const assignCode = useCallback(
    async (product: InvProduct, code: string) => {
      const updated = { ...product, barcode: code };
      try {
        await api({ action: "saveProduct", ...updated });
        setProducts((ps) => ps.map((p) => (p.id === product.id ? updated : p)));
        flash(`Código guardado en ${productTitle(product)}`);
        return true;
      } catch (e) {
        flash(e instanceof Error ? e.message : "Error al guardar el código", "err");
        return false;
      }
    },
    [api, flash],
  );

  // Refs para leer el estado actual desde el lector (callbacks de larga vida).
  const live = useRef({ products, variants, current, scanMode });
  live.current = { products, variants, current, scanMode };

  const handleCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      const { products: ps, variants: vs, current: cur, scanMode: mode } = live.current;
      setScanMode(null);
      if (!code) return;

      // Etiqueta QR propia: abre directamente esa variante (talla + personalización).
      if (code.startsWith("inv:")) {
        const v = vs.find((x) => x.id === code.slice(4));
        if (!v) {
          flash("Esa etiqueta no tiene stock ahora mismo", "err");
          return;
        }
        beep(1200);
        setCurrentId(v.productId);
        setSheetVariant(v.id);
        return;
      }

      const barcode = code.replace(/\s/g, "");
      if (mode === "draft") {
        setDraft((d) => (d ? { ...d, barcode } : d));
        return;
      }
      if (mode === "assign" && cur) {
        assignCode(cur, barcode);
        return;
      }

      // Buscar: varias camisetas pueden compartir código → se elige.
      const hits = ps.filter((p) => p.barcode === barcode);
      if (hits.length === 1) {
        beep(1200);
        setCurrentId(hits[0].id);
        setCustom(emptyCustom);
        setEditing(false);
        setSubtract(false);
        flash(`→ ${productTitle(hits[0])}`);
        topRef.current?.scrollIntoView({ behavior: "smooth" });
      } else {
        setAssignQuery("");
        setFound({ code: barcode, ids: hits.map((h) => h.id) });
      }
    },
    [assignCode, flash],
  );

  /* Lector Bluetooth/USB: escribe el código como un teclado muy rápido y
     termina en Enter. Se captura en toda la página salvo dentro de un campo. */
  useEffect(() => {
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      const now = performance.now();
      if (now - last > 80) buffer = "";
      last = now;
      if (e.key === "Enter") {
        if (buffer.length >= 4) {
          e.preventDefault();
          handleCode(buffer);
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCode]);

  /* ----------------------------- Datos derivados ----------------------------- */

  const reservedBy = useMemo(() => {
    const map = new Map<string, InvReservation[]>();
    for (const r of reservations) map.set(r.variantId, [...(map.get(r.variantId) ?? []), r]);
    return map;
  }, [reservations]);

  const stats = useMemo(() => {
    let units = 0;
    let value = 0;
    for (const v of variants) {
      units += v.qty;
      value += v.qty * num(byId.get(v.productId)?.price ?? "");
    }
    const teams = new Set(
      variants.map((v) => byId.get(v.productId)?.team).filter(Boolean) as string[],
    );
    return { units, reserved: reservations.length, teams: teams.size, value };
  }, [variants, reservations, byId]);

  const unitsOf = useCallback(
    (productId: string) =>
      variants.filter((v) => v.productId === productId).reduce((a, v) => a + v.qty, 0),
    [variants],
  );

  const currentRows = useMemo(
    () =>
      variants
        .filter((v) => v.productId === currentId)
        .sort(
          (a, b) =>
            sizeOrder(a.size) - sizeOrder(b.size) ||
            a.name.localeCompare(b.name) ||
            a.dorsal.localeCompare(b.dorsal, "es", { numeric: true }),
        ),
    [variants, currentId],
  );

  const stockTeams = useMemo(
    () =>
      [...new Set(products.map((p) => p.team))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "es")),
    [products],
  );

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return products
      .filter((p) => !teamFilter || p.team === teamFilter)
      .filter(
        (p) =>
          !sizeFilter || variants.some((v) => v.productId === p.id && v.size === sizeFilter),
      )
      .filter(
        (p) =>
          !q ||
          normalize(productTitle(p)).includes(q) ||
          (!!p.barcode && p.barcode.includes(q)) ||
          variants.some(
            (v) => v.productId === p.id && (normalize(v.name).includes(q) || v.dorsal === q),
          ),
      )
      .reverse(); // las últimas creadas arriba
  }, [products, variants, query, teamFilter, sizeFilter]);

  /* Combinaciones (nombre + dorsal + parches) ya usadas en esta camiseta:
     un toque para cambiar de una a otra sin volver a escribir. */
  const combos = useMemo(() => {
    const map = new Map<string, { name: string; dorsal: string; patches: string[]; qty: number }>();
    for (const v of currentRows) {
      const k = comboKey(v);
      const c = map.get(k);
      if (c) c.qty += v.qty;
      else map.set(k, { name: v.name, dorsal: v.dorsal, patches: v.patches, qty: v.qty });
    }
    return map;
  }, [currentRows]);
  const plainKey = comboKey(emptyCustom);
  const activeKey = comboKey(custom);

  /* Jugadores ya usados en este equipo: al escribir el nombre se rellena el dorsal. */
  const players = useMemo(() => {
    const map = new Map<string, string>();
    if (!current) return map;
    for (const v of variants) {
      if (v.name && v.dorsal && byId.get(v.productId)?.team === current.team && !map.has(v.name))
        map.set(v.name, v.dorsal);
    }
    return map;
  }, [variants, byId, current]);

  const patchImage = useMemo(
    () => new Map(patchOptions.map((o) => [o.label, o.src])),
    [patchOptions],
  );
  const allPatches = useMemo(
    () => [...patchOptions.map((o) => o.label), ...INV_EXTRA_PATCHES],
    [patchOptions],
  );

  const teamOptions = useMemo(
    () => [...new Set([...products.map((p) => p.team), ...INV_TEAMS])].filter(Boolean),
    [products],
  );
  const locationOptions = useMemo(
    () => [...new Set([...INV_LOCATIONS, ...variants.map((v) => v.location)])].filter(Boolean),
    [variants],
  );

  const draftPhoto = draft
    ? draft.photo ||
      (draft.copyPhotoFrom
        ? photoSrc(byId.get(draft.copyPhotoFrom) ?? emptyProduct())
        : draft.id
          ? photoSrc(byId.get(draft.id) ?? emptyProduct())
          : "")
    : "";

  const sheet = sheetVariant ? variants.find((v) => v.id === sheetVariant) : undefined;
  const sheetProduct = sheet ? byId.get(sheet.productId) : undefined;

  /* ----------------------------- Exportar ----------------------------- */

  const exportCsv = () => {
    const head = [
      "EQUIPO", "TEMPORADA", "MODELO", "TALLA", "NOMBRE", "DORSAL", "PARCHE",
      "CANTIDAD", "RESERVADAS", "UBICACIÓN", "COSTE (€)", "PVP (€)", "NOTAS", "CÓDIGO",
    ];
    const rows = [...variants]
      .sort(
        (a, b) =>
          titleOf(a.productId).localeCompare(titleOf(b.productId)) ||
          sizeOrder(a.size) - sizeOrder(b.size),
      )
      .map((v) => {
        const p = byId.get(v.productId) ?? emptyProduct();
        return [
          p.team, p.season, p.kit, v.size, v.name, v.dorsal,
          v.patches.join(" + ") || "Sin parche", v.qty, reservedBy.get(v.id)?.length ?? 0,
          v.location, p.cost, p.price, p.notes, p.barcode,
        ];
      });
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ------------------------------ Vista ------------------------------ */

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4">
      {/* ---------------- Totales ---------------- */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Camisetas" value={stats.units} />
        <Stat label="Reservadas" value={stats.reserved} />
        <Stat label="Equipos" value={stats.teams} />
        <Stat label="Valor PVP" value={stats.value ? euros(stats.value) : "—"} />
      </div>

      <div ref={topRef} className="scroll-mt-28" />

      {/* ---------------- Acciones principales ---------------- */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setScanMode("find")}
          className="rounded-xl bg-zinc-900 py-4 text-base font-semibold text-white active:scale-[0.98]"
        >
          📷 Escanear
        </button>
        <button
          type="button"
          onClick={() => setDraft(emptyProduct())}
          className="rounded-xl bg-amber-500 py-4 text-base font-semibold text-zinc-900 active:scale-[0.98]"
        >
          + Nueva camiseta
        </button>
      </div>

      {/* ---------------- Camiseta activa ---------------- */}
      {current ? (
        <section
          className={`flex flex-col gap-3 rounded-xl border-2 bg-white p-3 shadow-sm ${
            subtract ? "border-red-400" : "border-amber-400"
          }`}
        >
          <div className="flex items-center gap-3">
            <Thumb src={photoSrc(current)} size="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{current.team}</p>
              <p className="truncate text-sm text-zinc-600">
                {[current.kit, current.season].filter(Boolean).join(" · ")}
              </p>
              <p className="eyebrow">{unitsOf(current.id)} uds</p>
              <button
                type="button"
                onClick={() => setScanMode("assign")}
                className={`mt-1 rounded-md text-xs font-semibold ${
                  current.barcode ? "font-mono text-zinc-500" : "text-amber-700"
                }`}
              >
                {current.barcode ? `▮▯▮ ${current.barcode}` : "📷 Añadir código de barras"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDraft(current)}
              className="rounded-md px-2 py-2 text-sm text-zinc-500"
            >
              Editar
            </button>
          </div>

          {/* --- ¿Qué lleva? Cada toque de talla suma a esta combinación --- */}
          <div className="rounded-lg bg-zinc-50 p-2.5">
            <span className="eyebrow mb-1.5 block">¿Qué lleva?</span>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                on={activeKey === plainKey && !editing}
                onClick={() => {
                  setCustom({ ...emptyCustom, location: custom.location });
                  setEditing(false);
                }}
              >
                Lisa{combos.get(plainKey) ? ` · ${combos.get(plainKey)!.qty}` : ""}
              </Chip>
              {[...combos]
                .filter(([k]) => k !== plainKey)
                .map(([k, c]) => (
                  <Chip
                    key={k}
                    on={activeKey === k}
                    onClick={() => {
                      setCustom({ ...c, location: custom.location });
                      setEditing(false);
                    }}
                  >
                    {comboLabel(c)} · {c.qty}
                  </Chip>
                ))}
              {/* Combinación nueva que aún no tiene unidades */}
              {activeKey !== plainKey && !combos.has(activeKey) ? (
                <Chip on onClick={() => setEditing(true)}>
                  {comboLabel(custom)} · nueva
                </Chip>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setCustom({ ...emptyCustom, location: custom.location });
                  setEditing(true);
                  window.setTimeout(() => nameRef.current?.focus(), 50);
                }}
                className="rounded-full border border-dashed border-zinc-400 px-3 py-1.5 text-sm font-semibold text-zinc-700"
              >
                + Nombre y dorsal
              </button>
            </div>

            {editing || custom.name || custom.dorsal ? (
              <div className="mt-2.5 border-t border-zinc-200 pt-2.5">
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <input
                    ref={nameRef}
                    className="input uppercase"
                    placeholder="Nombre (opcional)"
                    autoCapitalize="characters"
                    list="inv-players"
                    value={custom.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const known = players.get(name.trim().toUpperCase());
                      setCustom({
                        ...custom,
                        name,
                        dorsal: known && !custom.dorsal ? known : custom.dorsal,
                      });
                    }}
                  />
                  <input
                    className="input text-center"
                    placeholder="Dorsal"
                    inputMode="numeric"
                    value={custom.dorsal}
                    onChange={(e) =>
                      setCustom({ ...custom, dorsal: e.target.value.replace(/\D/g, "").slice(0, 3) })
                    }
                  />
                </div>
                <datalist id="inv-players">
                  {[...players].map(([n, d]) => (
                    <option key={n} value={n}>
                      {d}
                    </option>
                  ))}
                </datalist>
              </div>
            ) : null}

            {/* Parches siempre a la vista: también hay lisas con parche */}
            <div className="mt-2.5 border-t border-zinc-200 pt-2.5">
              <span className="eyebrow mb-1 block">Parches (toca los que lleve)</span>
              <div className="flex flex-wrap gap-1.5">
                {allPatches.map((label) => {
                  const on = custom.patches.includes(label);
                  return (
                    <Chip
                      key={label}
                      on={on}
                      img={patchImage.get(label)}
                      onClick={() =>
                        setCustom({
                          ...custom,
                          patches: on
                            ? custom.patches.filter((p) => p !== label)
                            : [...custom.patches, label],
                        })
                      }
                    >
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </div>

            <div className="mt-2.5">
              <ChipRow label="Ubicación (opcional)">
                {locationOptions.map((loc) => (
                  <Chip
                    key={loc}
                    on={custom.location === loc}
                    onClick={() =>
                      setCustom({ ...custom, location: custom.location === loc ? "" : loc })
                    }
                  >
                    {loc}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          </div>

          {/* --- Tallas: cada toque = 1 camiseta --- */}
          <div>
            <p className={`mb-1.5 text-sm ${subtract ? "text-red-700" : "text-zinc-600"}`}>
              {subtract ? "Cada toque RESTA 1 de " : "Cada toque suma 1 de "}
              <b>{comboLabel(custom)}</b>
              {custom.location ? ` en ${custom.location}` : ""}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {SIZES.map((s) => {
                const n = qtyOf(keyFor(s));
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => tapSize(s)}
                    className={`flex h-14 flex-col items-center justify-center rounded-lg border text-base font-bold select-none active:scale-95 ${
                      n
                        ? subtract
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-amber-300 bg-amber-50 text-zinc-900"
                        : "border-zinc-200 bg-white text-zinc-400"
                    }`}
                    style={{ touchAction: "manipulation" }}
                  >
                    {s}
                    <span className="text-xs font-semibold">{n || "·"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSubtract((v) => !v)}
              className={`rounded-lg py-3 text-sm font-semibold ${
                subtract ? "bg-red-600 text-white" : "border border-zinc-300 text-zinc-700"
              }`}
            >
              {subtract ? "Modo RESTAR (−1)" : "Cambiar a restar"}
            </button>
            <button
              type="button"
              onClick={undo}
              disabled={!lastOps.length}
              className="rounded-lg border border-zinc-300 py-3 text-sm font-semibold text-zinc-700 disabled:opacity-40"
            >
              ↶ Deshacer
            </button>
          </div>

          {/* --- Filas de esta camiseta --- */}
          {currentRows.length ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100 text-left">
                  <tr>
                    <Th>Talla</Th>
                    <Th>Nombre</Th>
                    <Th>Parche</Th>
                    <Th>Ubic.</Th>
                    <Th className="text-right">Cant.</Th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map((v) => {
                    const res = reservedBy.get(v.id)?.length ?? 0;
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSheetVariant(v.id)}
                        className="cursor-pointer border-t border-zinc-100 active:bg-amber-50"
                      >
                        <td className="px-2 py-2 font-bold">{v.size}</td>
                        <td className="px-2 py-2">
                          {[v.name, v.dorsal].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="px-2 py-2 text-xs">{v.patches.join(" + ") || "—"}</td>
                        <td className="px-2 py-2">{v.location || "—"}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <span className="text-base font-bold">{v.qty}</span>
                          {res ? (
                            <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] font-semibold text-sky-800">
                              📌{res}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-zinc-100 px-2 py-1.5 text-[11px] text-zinc-500">
                Toca una fila para <b>vender</b>, <b>reservar</b> o seguir contando esa combinación.
              </p>
            </div>
          ) : null}
        </section>
      ) : loaded ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">
          Escanea la etiqueta, crea una camiseta o elige una de la lista para empezar a contar.
        </p>
      ) : null}

      {/* ---------------- Lista de camisetas ---------------- */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Buscar equipo, nombre, dorsal o código…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={!variants.length}
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 disabled:opacity-40"
          >
            Excel
          </button>
        </div>
        {stockTeams.length > 1 ? (
          <ChipRow>
            <Chip on={!teamFilter} onClick={() => setTeamFilter("")}>
              Todos
            </Chip>
            {stockTeams.map((t) => (
              <Chip key={t} on={teamFilter === t} onClick={() => setTeamFilter(teamFilter === t ? "" : t)}>
                {t}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
        <ChipRow>
          <Chip on={!sizeFilter} onClick={() => setSizeFilter("")}>
            Todas las tallas
          </Chip>
          {SIZES.map((s) => (
            <Chip key={s} on={sizeFilter === s} onClick={() => setSizeFilter(sizeFilter === s ? "" : s)}>
              {s}
            </Chip>
          ))}
        </ChipRow>
        {teamFilter || sizeFilter || query ? (
          <p className="text-sm text-zinc-600">
            {visible.length} {visible.length === 1 ? "camiseta" : "camisetas"}
            {sizeFilter
              ? ` · ${variants
                  .filter((v) => v.size === sizeFilter && visible.some((p) => p.id === v.productId))
                  .reduce((a, v) => a + v.qty, 0)} uds en talla ${sizeFilter}`
              : ""}
          </p>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {visible.map((p) => {
          const rows = variants.filter((v) => v.productId === p.id);
          const bySize = new Map<string, number>();
          for (const v of rows) bySize.set(v.size, (bySize.get(v.size) ?? 0) + v.qty);
          const summary = [...bySize]
            .sort((a, b) => sizeOrder(a[0]) - sizeOrder(b[0]))
            .map(([s, n]) => (s === sizeFilter ? `[${s}:${n}]` : `${s}:${n}`))
            .join("  ");
          const res = reservations.filter((r) => r.productId === p.id).length;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => select(p.id)}
                className={`flex w-full items-center gap-3 rounded-xl border bg-white p-2 text-left shadow-sm ${
                  p.id === currentId ? "border-amber-400" : "border-zinc-200"
                }`}
              >
                <Thumb src={photoSrc(p)} size="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{productTitle(p)}</p>
                  <p className="truncate text-xs text-zinc-500">{summary || "sin unidades"}</p>
                  {res ? <p className="text-[11px] font-semibold text-sky-700">📌 {res} reservadas</p> : null}
                </div>
                <span className="px-2 text-lg font-bold">{rows.reduce((a, v) => a + v.qty, 0)}</span>
              </button>
            </li>
          );
        })}
        {loaded && !visible.length && products.length ? (
          <li className="p-4 text-center text-sm text-zinc-500">Nada coincide.</li>
        ) : null}
      </ul>

      {/* ---------------- Escáner ---------------- */}
      {scanMode ? <Scanner onDetected={handleCode} onClose={() => setScanMode(null)} /> : null}

      {/* ---------------- Fila: vender / reservar ---------------- */}
      {sheet && sheetProduct ? (
        <VariantSheet
          key={sheet.id}
          variant={sheet}
          product={sheetProduct}
          photo={photoSrc(sheetProduct)}
          reservations={reservedBy.get(sheet.id) ?? []}
          onClose={() => setSheetVariant(null)}
          onCountMore={() => {
            setCurrentId(sheet.productId);
            setCustom({
              name: sheet.name,
              dorsal: sheet.dorsal,
              patches: sheet.patches,
              location: sheet.location,
            });
            setEditing(false);
            setSubtract(false);
            setSheetVariant(null);
          }}
          onSell={(price, customer, reservationId) => sell(sheet, price, customer, reservationId)}
          onReserve={(customer, until, note) => reserveOne(sheet, customer, until, note)}
          onCancelReservation={cancelReservation}
        />
      ) : null}

      {/* ---------------- Resultado de un código ---------------- */}
      {found ? (
        <Sheet onClose={() => setFound(null)}>
          <p className="eyebrow mb-1">Código leído</p>
          <p className="mb-3 font-mono text-lg font-semibold">{found.code}</p>

          {found.ids.length ? (
            <>
              <p className="mb-2 text-sm text-zinc-600">
                {found.ids.length} camisetas tienen este código. ¿Cuál es?
              </p>
              <div className="mb-3 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
                {found.ids.map((id) => {
                  const p = byId.get(id);
                  if (!p) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setFound(null);
                        select(id);
                      }}
                      className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 text-left active:bg-amber-50"
                    >
                      <Thumb src={photoSrc(p)} size="h-14 w-14" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.team}</span>
                        <span className="block truncate text-sm text-zinc-600">
                          {[p.kit, p.season].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="px-1 font-bold">{unitsOf(p.id)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="mb-3 text-sm text-zinc-600">Ninguna camiseta tiene este código todavía.</p>
          )}

          <button
            type="button"
            onClick={() => {
              setDraft({ ...emptyProduct(), barcode: found.code });
              setFound(null);
            }}
            className="mb-3 w-full rounded-lg bg-amber-500 py-3 font-semibold text-zinc-900"
          >
            + Nueva camiseta con este código
          </button>

          {/* Poner este código a una camiseta que ya existe */}
          <div className="border-t border-zinc-200 pt-3">
            <p className="eyebrow mb-1.5">…o pónselo a una que ya existe</p>
            <input
              className="input mb-2"
              placeholder="Buscar equipo…"
              value={assignQuery}
              onChange={(e) => setAssignQuery(e.target.value)}
            />
            <div className="flex max-h-[35vh] flex-col gap-1.5 overflow-y-auto">
              {products
                .filter(
                  (p) =>
                    !found.ids.includes(p.id) &&
                    normalize(productTitle(p)).includes(normalize(assignQuery.trim())),
                )
                .reverse()
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={async () => {
                      if (
                        p.barcode &&
                        !confirm(`${productTitle(p)} ya tiene el código ${p.barcode}. ¿Cambiarlo?`)
                      )
                        return;
                      if (await assignCode(p, found.code)) {
                        setFound(null);
                        select(p.id);
                      }
                    }}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 p-1.5 text-left active:bg-amber-50"
                  >
                    <Thumb src={photoSrc(p)} size="h-10 w-10" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {productTitle(p)}
                    </span>
                    {p.barcode ? (
                      <span className="text-[10px] text-zinc-400">ya tiene código</span>
                    ) : null}
                  </button>
                ))}
            </div>
          </div>
        </Sheet>
      ) : null}

      {/* ---------------- Formulario de camiseta ---------------- */}
      {draft ? (
        <ProductForm
          draft={draft}
          photo={draftPhoto}
          teamOptions={teamOptions}
          saving={saving}
          setDraft={setDraft}
          onSave={saveDraft}
          onClose={() => setDraft(null)}
          onScanCode={() => setScanMode("draft")}
          onDelete={() => {
            const p = byId.get(draft.id);
            if (p) removeProduct(p);
          }}
          onPhotoError={() => flash("No se pudo leer la foto", "err")}
        />
      ) : null}
    </main>
  );
}
