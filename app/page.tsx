import fs from "node:fs";
import path from "node:path";
import OrderBuilder from "./OrderBuilder";
import { PATCH_LABELS } from "./config";
import type { PatchOption } from "./types";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

// Se ejecuta en el servidor (en el build al desplegar): cualquier imagen que
// añadas a /public aparece automáticamente en el selector de parches.
function readPatchOptions(): PatchOption[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(path.join(process.cwd(), "public"));
  } catch {
    return [];
  }
  return files
    .filter((f) => IMAGE_EXT.test(f))
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
    .map((file) => {
      const base = file.replace(IMAGE_EXT, "");
      return {
        src: `/${file}`,
        label: PATCH_LABELS[base] ?? base.replace(/[-_]+/g, " "),
      };
    });
}

export default function Page() {
  return <OrderBuilder patchOptions={readPatchOptions()} />;
}
