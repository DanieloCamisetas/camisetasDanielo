"use client";

import { useEffect, useRef, useState } from "react";
import { readFileAsDataURL } from "./ImageInput";
import type { PatchOption } from "./types";

type Props = {
  label: string;
  value: string;
  options: PatchOption[];
  onChange: (value: string) => void;
  onRemove?: () => void;
};

/**
 * Selector de parche pensado para móvil: un botón grande que abre una hoja
 * inferior con miniaturas de las imágenes de /public. También permite subir
 * una foto o pegar una URL para parches que no estén en la carpeta.
 */
export default function PatchPicker({ label, value, options, onChange, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.src === value);
  const currentLabel = selected
    ? selected.label
    : value
      ? "Imagen personalizada"
      : "Elegir parche";

  // Bloquea el scroll de la página y permite cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    pick(await readFileAsDataURL(file));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setUrl(value && !value.startsWith("data:") && !selected ? value : "");
            setOpen(true);
          }}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border bg-white p-2 pr-3 text-left transition active:scale-[0.99] ${
            value ? "border-zinc-300" : "border-dashed border-zinc-300"
          } hover:border-amber-500`}
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-50">
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-2xl text-zinc-300">+</span>
            )}
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-sm font-medium ${
              value ? "text-zinc-900" : "text-zinc-500"
            }`}
          >
            {currentLabel}
          </span>
          <span className="text-zinc-400" aria-hidden>
            ▾
          </span>
        </button>

        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-100 hover:text-red-600"
            title="Quitar este parche"
            aria-label="Quitar este parche"
          >
            ✕
          </button>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Elegir parche"
        >
          <div
            className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-2 sm:hidden">
              <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300" />
            </div>
            <div className="flex items-center justify-between px-4 py-2">
              <h3 className="text-base font-semibold text-zinc-900">Elige un parche</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                <Tile active={!value} onClick={() => pick("")}>
                  <span className="flex h-20 items-center text-2xl text-zinc-300">∅</span>
                  <TileLabel>Sin parche</TileLabel>
                </Tile>

                {options.map((o) => (
                  <Tile key={o.src} active={o.src === value} onClick={() => pick(o.src)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={o.src}
                      alt=""
                      loading="lazy"
                      className="h-20 w-full object-contain"
                    />
                    <TileLabel>{o.label}</TileLabel>
                  </Tile>
                ))}

                <Tile active={false} onClick={() => fileRef.current?.click()}>
                  <span className="flex h-20 items-center text-2xl">📷</span>
                  <TileLabel>Subir foto</TileLabel>
                </Tile>
              </div>

              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (url.trim()) pick(url.trim());
                }}
              >
                <input
                  type="text"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="…o pega una URL de imagen"
                  className="input min-w-0 flex-1"
                />
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="shrink-0 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40"
                >
                  Usar
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tile({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-start gap-1 overflow-hidden rounded-xl border-2 bg-zinc-50 p-1.5 transition active:scale-95 ${
        active ? "border-amber-500 bg-amber-50" : "border-transparent hover:border-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function TileLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="line-clamp-2 w-full text-center text-[11px] leading-tight font-medium text-zinc-700">
      {children}
    </span>
  );
}
