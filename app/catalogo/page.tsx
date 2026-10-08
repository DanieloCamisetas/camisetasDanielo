import type { Metadata } from "next";
import { CATALOG_TITLE } from "../config";
import Catalogo from "./Catalogo";

export const metadata: Metadata = {
  title: CATALOG_TITLE,
  description: "Camisetas disponibles. Elige talla y pídela por WhatsApp.",
};

export default function Page() {
  return <Catalogo />;
}
