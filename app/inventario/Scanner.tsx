"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

// Formatos habituales en etiquetas de ropa + QR (por si imprimís los vuestros).
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] as const;

/**
 * Lector de códigos con la cámara trasera. Usa el BarcodeDetector nativo
 * (Chrome Android) o, si no existe (Safari iPhone), el mismo API sobre ZXing
 * en WebAssembly. Se cierra solo al leer un código.
 */
export default function Scanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let cancelled = false;

    (async () => {
      try {
        const { BarcodeDetector } = await import("barcode-detector/ponyfill");
        const detector = new BarcodeDetector({ formats: [...FORMATS] });

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (cancelled || doneRef.current) return;
          try {
            if (video.readyState >= 2) {
              const [hit] = await detector.detect(video);
              if (hit?.rawValue && !doneRef.current) {
                doneRef.current = true;
                navigator.vibrate?.(60);
                onDetected(hit.rawValue.trim());
                return;
              }
            }
          } catch {
            /* fotograma ilegible: seguimos */
          }
          timer = window.setTimeout(tick, 120);
        };
        tick();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Permiso de cámara denegado. Actívalo en los ajustes del navegador."
            : name === "NotFoundError"
              ? "No se encontró ninguna cámara."
              : "No se pudo abrir la cámara (¿la web está en https?).",
        );
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onDetected se captura una vez: el escáner se monta para una sola lectura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Marco de apuntado */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-[80%] max-w-md rounded-xl border-4 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        <p className="absolute inset-x-0 top-6 text-center text-sm font-medium text-white">
          Apunta al código de barras
        </p>
        {error ? (
          <div className="absolute inset-x-4 bottom-6 rounded-lg bg-red-600 p-3 text-center text-sm text-white">
            {error}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="bg-zinc-900 py-5 text-base font-semibold text-white"
      >
        Cerrar
      </button>
    </div>
  );
}
