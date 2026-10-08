import type { Metadata } from "next";
import Etiquetas from "./Etiquetas";

export const metadata: Metadata = { title: "Etiquetas · Inventario" };

export default function Page() {
  return <Etiquetas />;
}
