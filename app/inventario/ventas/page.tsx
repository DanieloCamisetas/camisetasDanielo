import type { Metadata } from "next";
import Ventas from "./Ventas";

export const metadata: Metadata = { title: "Ventas · Inventario" };

export default function Page() {
  return <Ventas />;
}
