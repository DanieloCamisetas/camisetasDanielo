"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toBlob, toPng } from "html-to-image";
import ImageInput from "./ImageInput";
import OrderSheet from "./OrderSheet";
import PatchPicker from "./PatchPicker";
import { SIZES, WHATSAPP_MESSAGE, WHATSAPP_NUMBER } from "./config";
import {
  type Customer,
  type ExtraRow,
  type OrderItem,
  type PatchOption,
  emptyCustomer,
  emptyItem,
} from "./types";

// Debe coincidir con el min-width de .sheet en globals.css: la hoja puede
// crecer por encima de este valor si el contenido lo necesita.
const SHEET_MIN_WIDTH = 660;

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${performance.now()}-${Math.round(Math.random() * 1e6)}`;

// Campos de un artículo que son listas de valores (varias por artículo).
type ListKey = "images" | "sizes" | "patches";

export default function OrderBuilder({ patchOptions }: { patchOptions: PatchOption[] }) {
  const [items, setItems] = useState<OrderItem[]>([emptyItem("item-1")]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);

  const [status, setStatus] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);
  const [busy, setBusy] = useState<null | "wa" | "png" | "copy">(null);
  // Imagen ya generada pendiente de compartir (si el navegador exigió un
  // segundo toque porque la generación tardó demasiado).
  const [pendingShare, setPendingShare] = useState<File | null>(null);
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
        images: [...prev[idx].images],
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

  /* --- Listas por artículo: imágenes, tallas y parches --- */
  const setListValue = (id: string, key: ListKey, index: number, value: string) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, [key]: it[key].map((v, i) => (i === index ? value : v)) }
          : it
      )
    );
  const addListValue = (id: string, key: ListKey) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [key]: [...it[key], ""] } : it))
    );
  const removeListValue = (id: string, key: ListKey, index: number) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, [key]: it[key].filter((_, i) => i !== index) } : it
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

  // Cualquier cambio en el pedido invalida la imagen pendiente de compartir.
  useEffect(() => setPendingShare(null), [items, extras, customer]);

  const fileName = () => {
    const stamp = customer.name.trim().replace(/\s+/g, "-").toLowerCase();
    return `pedido${stamp ? "-" + stamp : ""}.png`;
  };

  const renderBlob = async (node: HTMLElement) => {
    await warmUp(node);
    const blob = await toBlob(node, captureOptions);
    if (!blob) throw new Error("blob vacío");
    return blob;
  };

  const waNumber = WHATSAPP_NUMBER.replace(/\D/g, "");
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  const shareFile = async (file: File) => {
    try {
      await navigator.share({ files: [file] });
      setPendingShare(null);
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "AbortError") return; // el usuario cerró el menú
      if (name === "NotAllowedError") {
        // La generación tardó y el navegador perdió el "toque": pedimos otro.
        setPendingShare(file);
        flash("Imagen lista. Toca otra vez para enviarla", "ok");
        return;
      }
      throw e;
    }
  };

  /* Móvil: abre el menú de compartir con la imagen adjunta (eliges WhatsApp).
     Ordenador: copia la imagen y abre el chat del número configurado para
     pegarla con Ctrl+V. La web no puede adjuntar una imagen a un chat
     concreto de WhatsApp por sí sola. */
  const sendWhatsApp = async () => {
    const node = sheetRef.current;
    if (!node) return;

    if (pendingShare) {
      try {
        await shareFile(pendingShare);
      } catch (e) {
        console.error(e);
        flash("No se pudo compartir la imagen", "err");
      }
      return;
    }

    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const probe = new File([""], "x.png", { type: "image/png" });
    const canShareFiles =
      typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });

    setBusy("wa");
    try {
      if (isTouch && canShareFiles) {
        const blob = await renderBlob(node);
        await shareFile(new File([blob], fileName(), { type: "image/png" }));
        return;
      }

      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // write() síncrono con una promesa para conservar el gesto del usuario.
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": renderBlob(node) }),
        ]);
        flash("Imagen copiada: pégala en el chat con Ctrl+V", "ok");
      } else {
        const a = document.createElement("a");
        a.download = fileName();
        a.href = URL.createObjectURL(await renderBlob(node));
        a.click();
        URL.revokeObjectURL(a.href);
        flash("Imagen descargada: adjúntala en el chat", "ok");
      }
      if (!window.open(waUrl, "_blank")) {
        flash("Permite las ventanas emergentes para abrir WhatsApp", "err");
      }
    } catch (e) {
      console.error(e);
      flash("No se pudo generar la imagen. Revisa las imágenes por URL (CORS).", "err");
    } finally {
      setBusy(null);
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
      a.download = fileName();
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
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": renderBlob(node) }),
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
      it.images.some((src) => src.trim() !== "") ||
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
          <div className="flex items-center gap-3">
            <span className="eyebrow hidden sm:inline">{filledItems.length} artículos</span>
            <Link
              href="/inventario"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-amber-500 hover:text-amber-700"
            >
              Inventario
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 pt-6 pb-28 sm:px-6 lg:pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,540px)]">
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
                        className="flex h-9 w-9 items-center justify-center rounded-md text-sm text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-30"
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, 1)}
                        disabled={idx === items.length - 1}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-sm text-zinc-500 transition hover:bg-zinc-200 disabled:opacity-30"
                        title="Bajar"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateItem(item.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-sm text-zinc-500 transition hover:bg-zinc-200"
                        title="Duplicar"
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-sm text-zinc-500 transition hover:bg-red-100 hover:text-red-600 disabled:opacity-30"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    <div className="flex flex-col gap-2.5">
                      {item.images.map((src, i) => (
                        <ImageInput
                          key={i}
                          label={
                            item.images.length > 1
                              ? `Imagen del producto ${i + 1}`
                              : "Imagen del producto"
                          }
                          value={src}
                          onChange={(v) => setListValue(item.id, "images", i, v)}
                          onRemove={
                            item.images.length > 1
                              ? () => removeListValue(item.id, "images", i)
                              : undefined
                          }
                        />
                      ))}
                      <AddButton onClick={() => addListValue(item.id, "images")}>
                        + Añadir otra imagen
                      </AddButton>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {item.patches.map((p, i) => (
                        <PatchPicker
                          key={i}
                          label={
                            item.patches.length > 1
                              ? `Parche / Detalle ${i + 1}`
                              : "Parche / Detalle"
                          }
                          value={p}
                          options={patchOptions}
                          onChange={(v) => setListValue(item.id, "patches", i, v)}
                          onRemove={
                            item.patches.length > 1
                              ? () => removeListValue(item.id, "patches", i)
                              : undefined
                          }
                        />
                      ))}
                      <AddButton onClick={() => addListValue(item.id, "patches")}>
                        + Añadir otro parche
                      </AddButton>
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
                              onChange={(e) => setListValue(item.id, "sizes", i, e.target.value)}
                              placeholder="S, XL, 28…"
                              className="input min-w-0 flex-1"
                            />
                            {item.sizes.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeListValue(item.id, "sizes", i)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs text-zinc-400 transition hover:bg-red-100 hover:text-red-600"
                                title="Quitar talla"
                              >
                                ✕
                              </button>
                            ) : null}
                          </div>
                        ))}
                        <AddButton onClick={() => addListValue(item.id, "sizes")}>
                          + Talla
                        </AddButton>
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
        <aside id="vista-previa" className="scroll-mt-20 lg:sticky lg:top-[68px] lg:self-start">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <WhatsAppButton
                onClick={sendWhatsApp}
                busy={busy}
                ready={pendingShare !== null}
                className="hidden flex-1 lg:flex"
              />
              <button
                type="button"
                onClick={copyPng}
                disabled={busy !== null}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-amber-500 hover:text-amber-700 disabled:opacity-60 lg:flex-none"
              >
                {busy === "copy" ? "Copiando…" : "⧉ Copiar"}
              </button>
              <button
                type="button"
                onClick={downloadPng}
                disabled={busy !== null}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-amber-500 hover:text-amber-700 disabled:opacity-60 lg:flex-none"
              >
                {busy === "png" ? "Generando…" : "⬇ Descargar"}
              </button>
            </div>

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

      {/* Aviso flotante, visible también con la hoja lejos en pantalla */}
      {status ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-6">
          <div
            role="status"
            className={`rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
              status.tone === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {status.msg}
          </div>
        </div>
      ) : null}

      {/* Barra inferior fija en móvil: la acción principal siempre a mano */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <a
            href="#vista-previa"
            className="flex h-12 shrink-0 items-center rounded-xl border border-zinc-300 px-4 text-sm font-semibold text-zinc-700"
          >
            Ver hoja
          </a>
          <WhatsAppButton
            onClick={sendWhatsApp}
            busy={busy}
            ready={pendingShare !== null}
            className="flex h-12 flex-1"
          />
        </div>
      </div>
    </div>
  );
}

function WhatsAppButton({
  onClick,
  busy,
  ready,
  className = "",
}: {
  onClick: () => void;
  busy: string | null;
  ready: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className={`items-center justify-center gap-2 rounded-xl bg-[#1fa855] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#178f47] active:scale-[0.98] disabled:opacity-60 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43a9.4 9.4 0 0 1 9.43 9.44c0 5.2-4.23 9.43-9.44 9.43m8.03-17.46A11.3 11.3 0 0 0 12.05.7C5.79.7.7 5.79.7 12.04c0 2 .52 3.95 1.52 5.67L.6 23.6l6.02-1.58a11.3 11.3 0 0 0 5.42 1.38h.01c6.25 0 11.34-5.09 11.34-11.35 0-3.03-1.18-5.88-3.32-8.02" />
      </svg>
      {busy === "wa" ? "Generando…" : ready ? "Toca para enviar" : "Enviar por WhatsApp"}
    </button>
  );
}

function AddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 text-sm font-medium text-zinc-600 transition hover:border-amber-500 hover:text-amber-700 active:bg-amber-50 sm:w-auto sm:self-start sm:py-1.5 sm:text-xs"
    >
      {children}
    </button>
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
