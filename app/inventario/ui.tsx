"use client";

/* Piezas de interfaz compartidas por las pantallas del inventario. */

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

export const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Reduce la foto del móvil a una miniatura JPEG (~30-60 KB) para guardarla. */
export async function compressPhoto(file: File, max = 480): Promise<string> {
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
export function beep(freq = 880) {
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

export const fmtDate = (iso: string, withTime = true) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });

export type ToastState = { msg: string; tone: "ok" | "err" } | null;

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed inset-x-4 bottom-5 z-[70] mx-auto max-w-sm rounded-lg px-4 py-3 text-center text-sm font-semibold shadow-lg ${
        toast.tone === "ok" ? "bg-zinc-900 text-white" : "bg-red-600 text-white"
      }`}
    >
      {toast.msg}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-center">
      <p
        className={`truncate text-base font-bold ${
          tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : ""
        }`}
      >
        {value}
      </p>
      <p className="eyebrow truncate !text-[9px]">{label}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

export function ChipRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      {label ? <span className="eyebrow mb-1 block">{label}</span> : null}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">{children}</div>
    </div>
  );
}

export function Chip({
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

export function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1.5 text-[11px] font-semibold text-zinc-500 uppercase ${className}`}>
      {children}
    </th>
  );
}

export function Thumb({ src, size }: { src: string; size: string }) {
  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xl text-zinc-300">👕</span>
      )}
    </div>
  );
}

export function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? <p className="mb-2 text-xs text-zinc-500">{hint}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}
