"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toBlob, toPng } from "html-to-image";
import ImageInput from "./ImageInput";
import OrderSheet from "./OrderSheet";
import {
  type Customer,
  type ExtraRow,
  type OrderItem,
  emptyCustomer,
  emptyItem,
} from "./types";

// Debe coincidir con el min-width de .sheet en globals.css: la hoja puede
// crecer por encima de este valor si el contenido lo necesita.
const SHEET_MIN_WIDTH = 660;
const SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "16", "18", "20", "22", "24", "26", "28"];

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${performance.now()}-${Math.round(Math.random() * 1e6)}`;

export default function Page() {
  const [items, setItems] = useState<OrderItem[]>([emptyItem("item-1")]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);

  const [status, setStatus] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);
  const [busy, setBusy] = useState<null | "png" | "copy">(null);
  const [preview, setPreview] = useState({
    scale: 1,
    width: SHEET_MIN_WIDTH,
    height: 0,
  });

  const sheetRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  /* --- Ajuste de la vista previa al ancho disponible ---
     Se mide el tamaño REAL de la hoja (offsetWidth/Height no se ven afectados
     por el transform) y se reduce solo la visualización. Nunca se escala el
     nodo que se captura: html-to-image mide su ancho para recortar el PNG. */
  useEffect(() => {
    const frame = frameRef.current;
    const sheet = sheetRef.current;
    if (!frame || !sheet) return;

    const update = () => {
      const width = sheet.offsetWidth;
      const height = sheet.offsetHeight;
      const scale = Math.min(1, frame.clientWidth / width);
      setPreview((prev) =>
        prev.width === width && prev.height === height && prev.scale === scale
          ? prev
          : { scale, width, height },
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(frame);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, []);

  /* --- Aviso efímero --- */
  const flash = useCallback((msg: string, tone: "ok" | "err") => {
    setStatus({ msg, tone });
    window.setTimeout(() => setStatus(null), 3200);
  }, []);

  /* --- Mutadores de items --- */
  const patchItem = (id: string, patch: Partial<OrderItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const addItem = () => setItems((prev) => [...prev, emptyItem(uid())]);
  const removeItem = (id: string) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  const duplicateItem = (id: string) =>
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx < 0) return prev;
      const copy = {
        ...prev[idx],
        id: uid(),
        sizes: [...prev[idx].sizes],
        patches: [...prev[idx].patches],
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  const moveItem = (id: string, dir: -1 | 1) =>
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  /* --- Tallas (varias por artículo) --- */
  const setSize = (id: string, index: number, value: string) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, sizes: it.sizes.map((s, i) => (i === index ? value : s)) }
          : it
      )
    );
  const addSize = (id: string) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, sizes: [...it.sizes, ""] } : it))
    );
  const removeSize = (id: string, index: number) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, sizes: it.sizes.filter((_, i) => i !== index) }
          : it
      )
    );

  /* --- Parches (varios por artículo) --- */
  const setPatch = (id: string, index: number, value: string) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, patches: it.patches.map((p, i) => (i === index ? value : p)) }
          : it
      )
    );
  const addPatch = (id: string) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, patches: [...it.patches, ""] } : it))
    );
  const removePatch = (id: string, index: number) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, patches: it.patches.filter((_, i) => i !== index) }
          : it
      )
    );

  /* --- Extras --- */
  const addExtra = () =>
    setExtras((prev) => [...prev, { id: uid(), text: "", image: "" }]);
  const patchExtra = (id: string, patch: Partial<ExtraRow>) =>
    setExtras((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeExtra = (id: string) =>
    setExtras((prev) => prev.filter((e) => e.id !== id));

  /* --- Exportación --- */
  const captureOptions = {
    pixelRatio: 3,
    backgroundColor: "#ffffff",
    cacheBust: true,
    skipFonts: true,
  } as const;

  // Primer render suele fallar si las imágenes aún no cargaron: hacemos un warm-up.
  const warmUp = async (node: HTMLElement) => {
    try {
      await toPng(node, captureOptions);
    } catch {
      /* se ignora: es solo precalentamiento */
    }
  };

  const downloadPng = async () => {
    const node = sheetRef.current;
    if (!node) return;
    setBusy("png");
    try {
      await warmUp(node);
      const dataUrl = await toPng(node, captureOptions);
      const a = document.createElement("a");
      const stamp = customer.name.trim().replace(/\s+/g, "-").toLowerCase();
      a.download = `pedido${stamp ? "-" + stamp : ""}.png`;
      a.href = dataUrl;
      a.click();
      flash("Imagen descargada", "ok");
    } catch (e) {
      console.error(e);
      flash("No se pudo generar la imagen. Revisa las imágenes por URL (CORS).", "err");
    } finally {
      setBusy(null);
    }
  };

  const copyPng = async () => {
    const node = sheetRef.current;
    if (!node) return;
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      flash("Tu navegador no soporta copiar imágenes. Usa Descargar PNG.", "err");
      return;
    }
    setBusy("copy");
    try {
      // Pasamos una PROMESA a ClipboardItem y llamamos a write() de forma
      // síncrona (sin await previo) para conservar el gesto del usuario y
      // evitar el error "Document is not focused".
      const blobPromise = (async () => {
        await warmUp(node);
        const blob = await toBlob(node, captureOptions);
        if (!blob) throw new Error("blob vacío");
        return blob;
      })();

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blobPromise }),
      ]);
      flash("Imagen copiada al portapapeles", "ok");
    } catch (e) {
      console.error(e);
      flash("No se pudo copiar (ventana sin foco o permiso denegado). Usa Descargar PNG.", "err");
    } finally {
      setBusy(null);
    }
  };

  const filledItems = items.filter(
    (it) =>
      it.image ||
      it.sizes.some((s) => s.trim() !== "") ||
      it.name ||
      it.dorsal ||
      it.patches.some((p) => p.trim() !== "") ||
      it.note
  );

  return (
    <div className="min-h-screen">
      <datalist id="sizes">
        {SIZES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* ---------------- Cabecera ---------------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 font-mono text-sm font-bold text-amber-400">
              ⚑
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold text-zinc-900">
                Hoja de Pedido · Camisetas
              </h1>
              <p className="eyebrow">Generador de imagen para proveedor</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="eyebrow">{filledItems.length} artículos</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,540px)]">
        {/* ================= FORMULARIO ================= */}
        <section className="flex flex-col gap-6">
          {/* --- Artículos --- */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">Artículos</h2>
                <p className="eyebrow mt-0.5">Camisetas del pedido</p>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                + Añadir artículo
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 font-mono text-xs font-bold text-amber-800">
                      {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, -1)}
                        disabled={idx === 0}
                        className="rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-30"
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, 1)}
                        disabled={idx === items.length - 1}
                        className="rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-30"
                        title="Bajar"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateItem(item.id)}
                        className="rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-200"
                        title="Duplicar"
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-red-100 hover:text-red-600 disabled:opacity-30"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    <ImageInput
                      label="Imagen del producto"
                      value={item.image}
                      onChange={(v) => patchItem(item.id, { image: v })}
                    />

                    <div className="flex flex-col gap-2.5">
                      {item.patches.map((p, i) => (
                        <ImageInput
                          key={i}
                          label={
                            item.patches.length > 1
                              ? `Parche / Detalle ${i + 1}`
                              : "Parche / Detalle"
                          }
                          value={p}
                          onChange={(v) => setPatch(item.id, i, v)}
                          onRemove={
                            item.patches.length > 1
                              ? () => removePatch(item.id, i)
                              : undefined
                          }
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => addPatch(item.id)}
                        className="self-start rounded-md border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-amber-500 hover:text-amber-700"
                      >
                        + Añadir otro parche
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label={item.sizes.length > 1 ? "Tallas" : "Talla"}>
                      <div className="flex flex-col gap-1.5">
                        {item.sizes.map((s, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <input
                              list="sizes"
                              value={s}
                              onChange={(e) => setSize(item.id, i, e.target.value)}
                              placeholder="S, XL, 28…"
                              className="input min-w-0 flex-1"
                            />
                            {item.sizes.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeSize(item.id, i)}
                                className="shrink-0 rounded-md px-1.5 py-1 text-xs text-zinc-400 transition hover:bg-red-100 hover:text-red-600"
                                title="Quitar talla"
                              >
                                ✕
                              </button>
                            ) : null}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addSize(item.id)}
                          className="self-start rounded-md border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:border-amber-500 hover:text-amber-700"
                        >
                          + Añadir talla
                        </button>
                      </div>
                    </Field>
                    <Field label="Nombre">
                      <input
                        value={item.name}
                        onChange={(e) =>
                          patchItem(item.id, { name: e.target.value.toUpperCase() })
                        }
                        placeholder="RASHFORD"
                        className="input"
                      />
                    </Field>
                    <Field label="Dorsal">
                      <input
                        value={item.dorsal}
                        onChange={(e) => patchItem(item.id, { dorsal: e.target.value })}
                        placeholder="11"
                        inputMode="numeric"
                        className="input"
                      />
                    </Field>
                    <Field label="Precio">
                      <input
                        value={item.price}
                        onChange={(e) => patchItem(item.id, { price: e.target.value })}
                        placeholder="12€"
                        className="input"
                      />
                    </Field>
                  </div>

                  <div className="mt-3">
                    <Field label="Nota en columna de detalle (opcional)">
                      <input
                        value={item.note}
                        onChange={(e) => patchItem(item.id, { note: e.target.value })}
                        placeholder="p. ej. la camiseta que recibe el cliente es distinta…"
                        className="input"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* --- Extras (filas destacadas) --- */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">Extras</h2>
                <p className="eyebrow mt-0.5">Filas destacadas en amarillo (llaveros, notas…)</p>
              </div>
              <button
                type="button"
                onClick={addExtra}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-amber-500 hover:text-amber-700"
              >
                + Añadir extra
              </button>
            </div>
            {extras.length === 0 ? (
              <p className="text-sm text-zinc-400">Sin extras. Añade uno si lo necesitas.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {extras.map((e, i) => (
                  <div
                    key={e.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="eyebrow">Extra {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeExtra(e.id)}
                        className="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-red-100 hover:text-red-600"
                      >
                        ✕ Quitar
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Texto (opcional)">
                        <input
                          value={e.text}
                          onChange={(ev) => patchExtra(e.id, { text: ev.target.value })}
                          placeholder="Llavero Atlético de Madrid"
                          className="input"
                        />
                      </Field>
                      <ImageInput
                        label="Imagen (opcional)"
                        value={e.image}
                        onChange={(v) => patchExtra(e.id, { image: v })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* --- Datos del cliente --- */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-zinc-900">Datos de envío</h2>
              <p className="eyebrow mt-0.5">Cliente destinatario</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre" full>
                <input
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  placeholder="DANIEL FERRANDIZ NAVARLAZ"
                  className="input"
                />
              </Field>
              <Field label="Teléfono">
                <input
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  placeholder="678 200 383"
                  inputMode="tel"
                  className="input"
                />
              </Field>
              <Field label="Nación / País">
                <input
                  value={customer.country}
                  onChange={(e) => setCustomer({ ...customer, country: e.target.value })}
                  placeholder="ESPAÑA"
                  className="input"
                />
              </Field>
              <Field label="Provincia">
                <input
                  value={customer.province}
                  onChange={(e) => setCustomer({ ...customer, province: e.target.value })}
                  placeholder="BARCELONA"
                  className="input"
                />
              </Field>
              <Field label="Municipio / Ciudad">
                <input
                  value={customer.city}
                  onChange={(e) => setCustomer({ ...customer, city: e.target.value })}
                  placeholder="SANT ADRIÀ DEL BESÒS"
                  className="input"
                />
              </Field>
              <Field label="Dirección" full>
                <input
                  value={customer.address}
                  onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                  placeholder="calle Marte Nº24 piso 8º puerta 4ª"
                  className="input"
                />
              </Field>
              <Field label="Código Postal">
                <input
                  value={customer.postalCode}
                  onChange={(e) =>
                    setCustomer({ ...customer, postalCode: e.target.value })
                  }
                  placeholder="08930"
                  inputMode="numeric"
                  className="input"
                />
              </Field>
            </div>
          </div>
        </section>

        {/* ================= VISTA PREVIA ================= */}
        <aside className="lg:sticky lg:top-[68px] lg:self-start">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadPng}
                disabled={busy !== null}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60"
              >
                {busy === "png" ? "Generando…" : "⬇ Descargar imagen (PNG)"}
              </button>
              <button
                type="button"
                onClick={copyPng}
                disabled={busy !== null}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-amber-500 hover:text-amber-700 disabled:opacity-60"
              >
                {busy === "copy" ? "Copiando…" : "⧉ Copiar"}
              </button>
            </div>

            {status ? (
              <div
                className={`mb-3 rounded-md px-3 py-2 text-xs font-medium ${
                  status.tone === "ok"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {status.msg}
              </div>
            ) : null}

            <p className="eyebrow mb-2">Vista previa · alta resolución (×3)</p>

            <div className="max-h-[calc(100vh-220px)] overflow-auto rounded-lg border border-zinc-200 bg-zinc-100 p-3">
              <div ref={frameRef}>
                {/* Reserva el hueco que ocupa la hoja ya escalada */}
                <div
                  style={{
                    width: preview.width * preview.scale,
                    height: preview.height
                      ? preview.height * preview.scale
                      : undefined,
                  }}
                >
                  {/* transform escala solo la visualización; la hoja conserva
                      su tamaño real (max-content evita que se comprima) */}
                  <div
                    style={{
                      width: "max-content",
                      transform: `scale(${preview.scale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <OrderSheet
                      ref={sheetRef}
                      items={items}
                      extras={extras}
                      customer={customer}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}
