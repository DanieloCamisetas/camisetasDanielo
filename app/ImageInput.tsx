"use client";

import { useId, useRef } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
};

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ImageInput({ label, value, onChange, onRemove }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    onChange(dataUrl);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="eyebrow">
          {label}
        </label>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-1.5 text-xs text-zinc-400 transition hover:text-red-600"
            title="Quitar este parche"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="flex items-start gap-2">
        {/* Preview */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-zinc-300 bg-zinc-50">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[10px] text-zinc-400">sin img</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            id={inputId}
            type="text"
            inputMode="url"
            placeholder="Pega una URL…"
            value={value.startsWith("data:") ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />

          <div className="flex items-center gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-amber-500 hover:text-amber-700"
            >
              Subir archivo
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition hover:text-red-600"
              >
                Quitar
              </button>
            ) : (
              <span className="text-[10px] text-zinc-400">
                {value.startsWith("data:") ? "" : "URL o archivo"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
