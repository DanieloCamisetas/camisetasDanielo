"use client";

import { INV_KITS, INV_SEASONS } from "../config";
import type { InvProduct } from "../types";
import { Chip, ChipRow, Field, Sheet, Thumb, compressPhoto } from "./ui";

/** Camiseta en edición. copyPhotoFrom: al duplicar, usa la foto de la original. */
export type Draft = InvProduct & { copyPhotoFrom?: string };

export const emptyProduct = (): Draft => ({
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

type Props = {
  draft: Draft;
  photo: string; // foto a mostrar (nueva, actual o la de la original)
  teamOptions: string[];
  saving: boolean;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onClose: () => void;
  onScanCode: () => void;
  onDelete: () => void;
  onPhotoError: () => void;
};

export default function ProductForm({
  draft,
  photo,
  teamOptions,
  saving,
  setDraft,
  onSave,
  onClose,
  onScanCode,
  onDelete,
  onPhotoError,
}: Props) {
  return (
    <Sheet onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="flex flex-col gap-3"
      >
        <h2 className="text-base font-semibold">
          {draft.id ? "Editar camiseta" : draft.copyPhotoFrom ? "Duplicar camiseta" : "Nueva camiseta"}
        </h2>
        {draft.copyPhotoFrom ? (
          <p className="-mt-2 text-sm text-zinc-600">
            Copia de la anterior: cambia lo que sea distinto (temporada, equipación…).
          </p>
        ) : null}

        <label className="flex items-center gap-3">
          <Thumb src={photo} size="h-20 w-20" />
          <span className="flex-1 rounded-lg border border-zinc-300 py-3 text-center text-sm font-semibold">
            📷 {photo ? "Cambiar foto" : "Hacer foto"}
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
                setDraft({ ...draft, photo: await compressPhoto(file) });
              } catch {
                onPhotoError();
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
              onClick={onScanCode}
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
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, id: "", photo: "", photoV: undefined, copyPhotoFrom: draft.id })
              }
              className="rounded-lg border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700"
            >
              ⧉ Duplicar
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg py-2.5 text-sm font-medium text-red-600"
            >
              Borrar camiseta
            </button>
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
