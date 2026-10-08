import type { Metadata } from "next";
import { readPatchOptions } from "../patches";
import Inventory from "./Inventory";

export const metadata: Metadata = {
  title: "Inventario · Camisetas",
};

export default function Page() {
  return <Inventory patchOptions={readPatchOptions()} />;
}
