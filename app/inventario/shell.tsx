"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Toast, type ToastState } from "./ui";

/**
 * Marco común de las pantallas del inventario: PIN, nombre de quien lo usa,
 * pestañas, avisos y cola de toques sin conexión.
 */

const PIN_KEY = "inv-pin";
const USER_KEY = "inv-user";
const QUEUE_KEY = "inv-queue";

const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** true si el fallo es de red (sin cobertura), no del servidor. */
export const isOffline = (e: unknown) => e instanceof TypeError;

type Ctx = {
  /** GET (sin body) o POST (con body) a /api/inventario. */
  api: <T = Record<string, unknown>>(body?: object, query?: string) => Promise<T>;
  /** Como api, pero si no hay conexión lo guarda y lo envía al volver. */
  send: (body: object) => Promise<"sent" | "queued">;
  flash: (msg: string, tone?: "ok" | "err") => void;
  user: string;
  queued: number;
};

const InvContext = createContext<Ctx | null>(null);

export function useInv() {
  const ctx = useContext(InvContext);
  if (!ctx) throw new Error("useInv fuera de <InvShell>");
  return ctx;
}

const TABS = [
  { href: "/inventario", label: "Contar", key: "contar" },
  { href: "/inventario/ventas", label: "Ventas", key: "ventas" },
  { href: "/inventario/historial", label: "Historial", key: "historial" },
  { href: "/inventario/etiquetas", label: "Etiquetas", key: "etiquetas" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export function InvShell({
  active,
  actions,
  children,
}: {
  active: TabKey;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [pinState, setPinState] = useState<null | "none" | "bad">(null);
  const [user, setUser] = useState<string | null>(null); // null = aún no leído
  const [epoch, setEpoch] = useState(0); // remonta la pantalla tras meter el PIN
  const [toast, setToast] = useState<ToastState>(null);
  const [queued, setQueued] = useState(0);
  const toastTimer = useRef(0);
  const flushing = useRef(false);

  useEffect(() => {
    setUser(read(USER_KEY));
    setQueued(loadQueue().length);
  }, []);

  const flash = useCallback((msg: string, tone: "ok" | "err" = "ok") => {
    setToast({ msg, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const request = useCallback(async (body?: object, query?: string) => {
    const res = await fetch(`/api/inventario${query ? `?${query}` : ""}`, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        "x-pin": read(PIN_KEY),
        "x-user": encodeURIComponent(read(USER_KEY)),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) setPinState(data.pin === "none" ? "none" : "bad");
    if (!res.ok) throw new ApiError(data.error || `Error ${res.status}`, res.status);
    return data;
  }, []);

  const api = useCallback(
    <T,>(body?: object, query?: string) => request(body, query) as Promise<T>,
    [request],
  );

  /* ---- Cola sin conexión (solo toques de contar, que son idempotentes por opId) ---- */

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let queue = loadQueue();
      while (queue.length) {
        try {
          await request(queue[0]);
        } catch (e) {
          if (isOffline(e)) break; // seguimos sin red: se reintenta luego
          if (e instanceof ApiError && e.status === 401) break;
          flash(`Un toque guardado sin conexión falló: ${(e as Error).message}`, "err");
        }
        queue = loadQueue().slice(1);
        saveQueue(queue);
        setQueued(queue.length);
      }
    } finally {
      flushing.current = false;
    }
  }, [request, flash]);

  const send = useCallback(
    async (body: object): Promise<"sent" | "queued"> => {
      const enqueue = () => {
        const q = [...loadQueue(), body];
        saveQueue(q);
        setQueued(q.length);
        return "queued" as const;
      };
      // Si ya hay cola, se respeta el orden.
      if (loadQueue().length) {
        enqueue();
        flush();
        return "queued";
      }
      try {
        await request(body);
        return "sent";
      } catch (e) {
        if (isOffline(e)) return enqueue();
        throw e;
      }
    },
    [request, flush],
  );

  useEffect(() => {
    flush();
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    const t = window.setInterval(() => loadQueue().length && flush(), 15000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(t);
    };
  }, [flush]);

  /* ---- Pantallas previas ---- */

  if (pinState) {
    return (
      <>
        <PinScreen
          mode={pinState}
          onSubmit={async (pin) => {
            if (pinState === "none") {
              try {
                await request({ action: "createPin", pin });
              } catch (e) {
                flash(e instanceof Error ? e.message : "Error", "err");
                return;
              }
            }
            write(PIN_KEY, pin);
            setPinState(null);
            setEpoch((n) => n + 1);
          }}
        />
        <Toast toast={toast} />
      </>
    );
  }

  if (user === null) return null;

  if (!user) {
    return (
      <NameScreen
        onSubmit={(name) => {
          write(USER_KEY, name);
          setUser(name);
        }}
      />
    );
  }

  return (
    <InvContext.Provider value={{ api, send, flash, user, queued }}>
      <div className="min-h-screen pb-24 print:pb-0">
        <header className="sticky top-0 z-20 border-b print:hidden border-zinc-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 pt-3">
            <h1 className="text-sm font-semibold text-zinc-900">👕 Inventario</h1>
            <div className="flex items-center gap-1.5">
              {actions}
              <Link
                href="/catalogo"
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700"
              >
                Catálogo
              </Link>
              <Link
                href="/"
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700"
              >
                Pedidos
              </Link>
            </div>
          </div>
          <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pt-2">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={`shrink-0 border-b-2 px-3 pb-2 text-sm font-semibold ${
                  active === t.key
                    ? "border-amber-500 text-zinc-900"
                    : "border-transparent text-zinc-500"
                }`}
              >
                {t.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                if (confirm(`Estás como "${user}". ¿Cambiar de nombre?`)) setUser("");
              }}
              className="ml-auto shrink-0 pb-2 text-xs text-zinc-400"
            >
              👤 {user}
            </button>
          </nav>
        </header>

        {queued ? (
          <div className="bg-amber-100 px-4 py-2 text-center print:hidden text-sm font-medium text-amber-900">
            📴 Sin conexión · {queued} {queued === 1 ? "toque pendiente" : "toques pendientes"} de
            subir (se envían solos al volver la señal)
          </div>
        ) : null}

        <div key={epoch}>{children}</div>
      </div>
      <Toast toast={toast} />
      <ServiceWorker />
    </InvContext.Provider>
  );
}

function loadQueue(): object[] {
  try {
    return JSON.parse(read(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveQueue(q: object[]) {
  write(QUEUE_KEY, JSON.stringify(q));
}

/** Registra el service worker (app instalable y abre sin conexión). Solo en producción. */
function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */

function PinScreen({ mode, onSubmit }: { mode: "none" | "bad"; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const creating = mode === "none";
  const valid = pin.length >= 4 && (!creating || pin === pin2);
  const hadPin = !!read(PIN_KEY);

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
        ) : hadPin ? (
          <p className="text-sm text-red-600">El PIN guardado no vale (¿lo habéis cambiado?).</p>
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
    </div>
  );
}

function NameScreen({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        className="flex w-full max-w-xs flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim().slice(0, 30));
        }}
      >
        <h1 className="text-base font-semibold">¿Quién eres?</h1>
        <p className="text-sm text-zinc-600">
          Para el historial: así se sabe quién contó o vendió cada camiseta. Solo se pregunta
          una vez en este móvil.
        </p>
        <input
          className="input"
          placeholder="Tu nombre"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          disabled={!name.trim()}
          className="rounded-lg bg-zinc-900 py-3 font-semibold text-white disabled:opacity-40"
        >
          Continuar
        </button>
      </form>
    </div>
  );
}
