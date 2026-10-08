"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INV_EXTRA_PATCHES,
  INV_KITS,
  INV_LOCATIONS,
  INV_SEASONS,
  INV_TEAMS,
  SIZES,
} from "../config";
import {
  type InvProduct,
  type InvVariant,
  type InvVariantKey,
  type PatchOption,
  normalizeVariantKey,
  productTitle,
  variantId,
} from "../types";
import Scanner from "./Scanner";

const PIN_KEY = "inv-pin";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const sizeOrder = (s: string) => {
  const i = SIZES.indexOf(s);
  return i < 0 ? 999 : i;
};

const euros = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const num = (v: string) => {
  const n = parseFloat(v.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Reduce la foto del móvil a una miniatura JPEG (~30 KB) para guardarla. */
async function compressPhoto(file: File, max = 480): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}

/** Pitido corto de confirmación (sin archivos de audio). */
let audioCtx: AudioContext | null = null;
function beep(freq = 880) {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.07);
  } catch {
    /* sin audio: no pasa nada */
  }
}

const emptyProduct = (): InvProduct => ({
  id: "",
  team: "",
  season: INV_SEASONS[0] ?? "",
  kit: INV_KITS[0] ?? "",
  photo: "",
  barcode: "",
  cost: "",
  price: "",
  notes: "",
});

/** Personalización activa: se aplica a cada toque de talla. */
type Custom = { name: string; dorsal: string; patches: string[]; location: string };
const emptyCustom: Custom = { name: "", dorsal: "", patches: [], location: "" };

type Undo = { key: InvVariantKey; delta: number };

const comboKey = (c: Pick<Custom, "name" | "dorsal" | "patches">) =>
  [c.name.trim().toUpperCase(), c.dorsal.trim(), [...c.patches].sort().join("+")].join("|");

const comboLabel = (c: Pick<Custom, "name" | "dorsal" | "patches">) =>
  [
    [c.name.trim().toUpperCase(), c.dorsal.trim()].filter(Boolean).join(" ") || "Lisa",
    c.patches.join(" + "),
  ]
    .filter(Boolean)
    .join(" · ");

export default function Inventory({ patchOptions }: { patchOptions: PatchOption[] }) {
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [variants, setVariants] = useState<InvVariant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pinState, setPinState] = useState<null | "none" | "bad">(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [custom, setCustom] = useState<Custom>(emptyCustom);
  const [subtract, setSubtract] = useState(false);
  const [lastOps, setLastOps] = useState<Undo[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  // Para qué se abre el escáner: buscar, rellenar el formulario o asignar a la camiseta activa.
  const [scanMode, setScanMode] = useState<null | "find" | "draft" | "assign">(null);
  const [found, setFound] = useState<{ code: string; ids: string[] } | null>(null);
  const [assignQuery, setAssignQuery] = useState("");
  const [draft, setDraft] = useState<InvProduct | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);
  const [saving, setSaving] = useState(false);

  const pending = useRef(0);
  const toastTimer = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((msg: string, tone: "ok" | "err" = "ok") => {
    setToast({ msg, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  /* ------------------------------- API ------------------------------- */

  const api = useCallback(async (body?: object) => {
    let pin = "";
    try {
      pin = localStorage.getItem(PIN_KEY) ?? "";
    } catch {}
    const res = await fetch("/api/inventario", {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-pin": pin },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) setPinState(data.pin === "none" ? "none" : "bad");
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api();
      // No pisar los toques que aún están viajando al servidor.
      if (pending.current === 0) {
        setProducts(data.products);
        setVariants(data.variants);
      }
      setPinState(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar";
      let hasPin = false;
      try {
        hasPin = !!localStorage.getItem(PIN_KEY);
      } catch {}
      // Sin PIN guardado es la primera visita: la pantalla de PIN ya lo explica.
      if (msg !== "Crea un PIN" && (hasPin || msg !== "PIN incorrecto")) flash(msg, "err");
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

  /* ----------------------------- Stock ----------------------------- */

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

  const changeStock = useCallback(
    async (key: InvVariantKey, delta: number, record = true) => {
      applyLocal(key, delta);
      navigator.vibrate?.(25);
      beep(delta > 0 ? 880 : 440);
      if (record) setLastOps((ops) => [...ops.slice(-49), { key, delta }]);
      pending.current++;
      try {
        await api({ action: "stock", ...key, delta });
      } catch (e) {
        applyLocal(key, -delta);
        flash(`No se guardó: ${e instanceof Error ? e.message : ""}`, "err");
      } finally {
        pending.current--;
      }
    },
    [api, flash],
  );

  const current = products.find((p) => p.id === currentId) ?? null;
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
    const product = { ...draft, id: draft.id || uid() };
    setSaving(true);
    try {
      await api({ action: "saveProduct", ...product });
      setProducts((ps) =>
        ps.some((p) => p.id === product.id)
          ? ps.map((p) => (p.id === product.id ? product : p))
          : [...ps, product],
      );
      setDraft(null);
      if (draft.id) flash("Camiseta actualizada");
      else {
        select(product.id);
        flash("Creada: ahora toca las tallas");
      }
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

  /* ------------------------- Código de barras ------------------------- */

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
  const live = useRef({ products, current: null as InvProduct | null, scanMode });
  live.current = {
    products,
    current: products.find((p) => p.id === currentId) ?? null,
    scanMode,
  };

  const handleCode = useCallback(
    (raw: string) => {
      const code = raw.replace(/\s/g, "");
      const { products: ps, current: cur, scanMode: mode } = live.current;
      setScanMode(null);
      if (!code) return;

      if (mode === "draft") {
        setDraft((d) => (d ? { ...d, barcode: code } : d));
        return;
      }
      if (mode === "assign" && cur) {
        assignCode(cur, code);
        return;
      }

      // Buscar: varias camisetas pueden compartir código → se elige.
      const hits = ps.filter((p) => p.barcode === code);
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
        setFound({ code, ids: hits.map((h) => h.id) });
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

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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
    return { units, rows: variants.length, teams: teams.size, value };
  }, [variants, byId]);

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

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    const list = q
      ? products.filter(
          (p) =>
            normalize(productTitle(p)).includes(q) ||
            (!!p.barcode && p.barcode.includes(q)) ||
            variants.some(
              (v) =>
                v.productId === p.id && (normalize(v.name).includes(q) || v.dorsal === q),
            ),
        )
      : products;
    return [...list].reverse(); // las últimas creadas arriba
  }, [products, variants, query]);

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

  /* ----------------------------- Exportar ----------------------------- */

  const exportCsv = () => {
    const head = [
      "EQUIPO", "TEMPORADA", "MODELO", "TALLA", "NOMBRE", "DORSAL", "PARCHE",
      "CANTIDAD", "UBICACIÓN", "COSTE (€)", "PVP (€)", "NOTAS", "CÓDIGO",
    ];
    const rows = [...variants]
      .sort((a, b) => {
        const pa = byId.get(a.productId);
        const pb = byId.get(b.productId);
        return (
          productTitle(pa ?? emptyProduct()).localeCompare(productTitle(pb ?? emptyProduct())) ||
          sizeOrder(a.size) - sizeOrder(b.size)
        );
      })
      .map((v) => {
        const p = byId.get(v.productId) ?? emptyProduct();
        return [
          p.team, p.season, p.kit, v.size, v.name, v.dorsal,
          v.patches.join(" + ") || "Sin parche", v.qty, v.location,
          p.cost, p.price, p.notes, p.barcode,
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

  /* ------------------------------ PIN ------------------------------ */

  if (pinState) {
    return (
      <PinScreen
        mode={pinState}
        onSubmit={async (pin) => {
          if (pinState === "none") {
            try {
              await api({ action: "createPin", pin });
            } catch (e) {
              flash(e instanceof Error ? e.message : "Error", "err");
              return;
            }
          }
          try {
            localStorage.setItem(PIN_KEY, pin);
          } catch {}
          refresh();
        }}
        toast={toast}
      />
    );
  }

  /* ------------------------------ Vista ------------------------------ */

  return (
    <div className="min-h-screen pb-24">
      {/* ---------------- Cabecera ---------------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-sm font-semibold text-zinc-900">👕 Inventario</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!variants.length}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40"
            >
              Excel
            </button>
            <Link
              href="/"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700"
            >
              Pedidos
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4">
        {/* ---------------- Totales (como el Excel) ---------------- */}
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Camisetas" value={stats.units} />
          <Stat label="Variantes" value={stats.rows} />
          <Stat label="Equipos" value={stats.teams} />
          <Stat label="Valor PVP" value={stats.value ? euros(stats.value) : "—"} />
        </div>

        <div ref={topRef} className="scroll-mt-20" />

        {/* ---------------- Acciones principales ---------------- */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setScanMode("find")}
            className="rounded-xl bg-zinc-900 py-4 text-base font-semibold text-white active:scale-[0.98]"
          >
            📷 Buscar por código
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
              <Thumb src={current.photo} size="h-16 w-16" />
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

            {/* --- Filas de esta camiseta (como en el Excel) --- */}
            {currentRows.length ? (
              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-100 text-left">
                    <tr>
                      <Th>Talla</Th>
                      <Th>Nombre</Th>
                      <Th>Dorsal</Th>
                      <Th>Parche</Th>
                      <Th>Ubic.</Th>
                      <Th className="text-right">Cant.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.map((v) => (
                      <tr
                        key={v.id}
                        onClick={() =>
                          setCustom({
                            name: v.name,
                            dorsal: v.dorsal,
                            patches: v.patches,
                            location: v.location,
                          })
                        }
                        className="cursor-pointer border-t border-zinc-100 active:bg-amber-50"
                      >
                        <td className="px-2 py-2 font-bold">{v.size}</td>
                        <td className="px-2 py-2">{v.name || "—"}</td>
                        <td className="px-2 py-2">{v.dorsal || "—"}</td>
                        <td className="px-2 py-2 text-xs">{v.patches.join(" + ") || "—"}</td>
                        <td className="px-2 py-2">{v.location || "—"}</td>
                        <td className="px-2 py-2 text-right text-base font-bold">{v.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-zinc-100 px-2 py-1.5 text-[11px] text-zinc-500">
                  Toca una fila para seguir sumando a esa misma combinación.
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
        <input
          className="input"
          placeholder="Buscar equipo, nombre, dorsal o código…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul className="flex flex-col gap-2">
          {visible.map((p) => {
            const rows = variants.filter((v) => v.productId === p.id);
            const bySize = new Map<string, number>();
            for (const v of rows) bySize.set(v.size, (bySize.get(v.size) ?? 0) + v.qty);
            const summary = [...bySize]
              .sort((a, b) => sizeOrder(a[0]) - sizeOrder(b[0]))
              .map(([s, n]) => `${s}:${n}`)
              .join("  ");
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => select(p.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border bg-white p-2 text-left shadow-sm ${
                    p.id === currentId ? "border-amber-400" : "border-zinc-200"
                  }`}
                >
                  <Thumb src={p.photo} size="h-14 w-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{productTitle(p)}</p>
                    <p className="truncate text-xs text-zinc-500">{summary || "sin unidades"}</p>
                  </div>
                  <span className="px-2 text-lg font-bold">
                    {rows.reduce((a, v) => a + v.qty, 0)}
                  </span>
                </button>
              </li>
            );
          })}
          {loaded && !visible.length && products.length ? (
            <li className="p-4 text-center text-sm text-zinc-500">Nada coincide.</li>
          ) : null}
        </ul>
      </main>

      {/* ---------------- Escáner ---------------- */}
      {scanMode ? <Scanner onDetected={handleCode} onClose={() => setScanMode(null)} /> : null}

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
                      <Thumb src={p.photo} size="h-14 w-14" />
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
                    <Thumb src={p.photo} size="h-10 w-10" />
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
        <Sheet onClose={() => setDraft(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveDraft();
            }}
            className="flex flex-col gap-3"
          >
            <h2 className="text-base font-semibold">
              {draft.id ? "Editar camiseta" : "Nueva camiseta"}
            </h2>

            <label className="flex items-center gap-3">
              <Thumb src={draft.photo} size="h-20 w-20" />
              <span className="flex-1 rounded-lg border border-zinc-300 py-3 text-center text-sm font-semibold">
                📷 {draft.photo ? "Cambiar foto" : "Hacer foto"}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const photo = await compressPhoto(file);
                    setDraft((d) => (d ? { ...d, photo } : d));
                  } catch {
                    flash("No se pudo leer la foto", "err");
                  }
                }}
              />
            </label>

            <Field label="Equipo">
              <ChipRow>
                {teamOptions.map((t) => (
                  <Chip key={t} on={draft.team === t} onClick={() => setDraft({ ...draft, team: t })}>
                    {t}
                  </Chip>
                ))}
              </ChipRow>
              <input
                className="input"
                placeholder="…u otro equipo"
                value={draft.team}
                onChange={(e) => setDraft({ ...draft, team: e.target.value })}
              />
            </Field>

            <Field label="Temporada">
              <ChipRow>
                {INV_SEASONS.map((s) => (
                  <Chip key={s} on={draft.season === s} onClick={() => setDraft({ ...draft, season: s })}>
                    {s}
                  </Chip>
                ))}
              </ChipRow>
              <input
                className="input"
                placeholder="…u otra"
                value={draft.season}
                onChange={(e) => setDraft({ ...draft, season: e.target.value })}
              />
            </Field>

            <Field label="Modelo">
              <ChipRow>
                {INV_KITS.map((k) => (
                  <Chip key={k} on={draft.kit === k} onClick={() => setDraft({ ...draft, kit: k })}>
                    {k}
                  </Chip>
                ))}
              </ChipRow>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Coste (€)">
                <input
                  className="input"
                  inputMode="decimal"
                  value={draft.cost}
                  onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                />
              </Field>
              <Field label="PVP (€)">
                <input
                  className="input"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Código de barras">
              <div className="flex gap-2">
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="Escanéalo o escríbelo"
                  value={draft.barcode}
                  onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setScanMode("draft")}
                  className="shrink-0 rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white"
                >
                  📷
                </button>
              </div>
            </Field>

            <Field label="Notas">
              <input
                className="input"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>

            <button
              type="submit"
              disabled={!draft.team.trim() || saving}
              className="rounded-lg bg-zinc-900 py-3.5 font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Guardando…" : draft.id ? "Guardar" : "Crear y contar tallas"}
            </button>
            {draft.id ? (
              <button
                type="button"
                onClick={() => removeProduct(draft)}
                className="py-2 text-sm font-medium text-red-600"
              >
                Borrar camiseta
              </button>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PinScreen({
  mode,
  onSubmit,
  toast,
}: {
  mode: "none" | "bad";
  onSubmit: (pin: string) => void;
  toast: { msg: string; tone: "ok" | "err" } | null;
}) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const creating = mode === "none";
  const valid = pin.length >= 4 && (!creating || pin === pin2);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        className="flex w-full max-w-xs flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(pin);
        }}
      >
        <h1 className="text-base font-semibold">
          {creating ? "Crea el PIN del inventario" : "PIN del inventario"}
        </h1>
        {creating ? (
          <p className="text-sm text-zinc-600">
            Es la primera vez. Elige un PIN (mínimo 4 cifras, mejor 6). Se pedirá una vez en
            cada móvil.
          </p>
        ) : null}
        <input
          className="input text-center text-lg tracking-[0.4em]"
          type="password"
          inputMode="numeric"
          autoComplete={creating ? "new-password" : "current-password"}
          placeholder="PIN"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\s/g, ""))}
        />
        {creating ? (
          <input
            className="input text-center text-lg tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="Repite el PIN"
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\s/g, ""))}
          />
        ) : null}
        <button
          disabled={!valid}
          className="rounded-lg bg-zinc-900 py-3 font-semibold text-white disabled:opacity-40"
        >
          {creating ? "Crear PIN" : "Entrar"}
        </button>
      </form>
      <Toast toast={toast} />
    </div>
  );
}

function Toast({ toast }: { toast: { msg: string; tone: "ok" | "err" } | null }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed inset-x-4 bottom-5 z-[60] mx-auto max-w-sm rounded-lg px-4 py-3 text-center text-sm font-semibold shadow-lg ${
        toast.tone === "ok" ? "bg-zinc-900 text-white" : "bg-red-600 text-white"
      }`}
    >
      {toast.msg}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-center">
      <p className="truncate text-base font-bold">{value}</p>
      <p className="eyebrow truncate !text-[9px]">{label}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

function ChipRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      {label ? <span className="eyebrow mb-1 block">{label}</span> : null}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">{children}</div>
    </div>
  );
}

function Chip({
  on,
  img,
  onClick,
  children,
}: {
  on: boolean;
  img?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 text-sm font-medium whitespace-nowrap ${
        img ? "pr-3 pl-1" : "px-3"
      } ${on ? "border-amber-500 bg-amber-100 text-zinc-900" : "border-zinc-300 bg-white text-zinc-600"}`}
      style={{ touchAction: "manipulation" }}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : null}
      {children}
    </button>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-1.5 text-[11px] font-semibold uppercase text-zinc-500 ${className}`}>{children}</th>;
}

function Thumb({ src, size }: { src: string; size: string }) {
  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xl text-zinc-300">👕</span>
      )}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-8 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
