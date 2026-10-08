import type { Metadata } from "next";
import Historial from "./Historial";

export const metadata: Metadata = { title: "Historial · Inventario" };

export default function Page() {
  return <Historial />;
}
