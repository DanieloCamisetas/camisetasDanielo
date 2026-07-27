import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Generador de Hojas de Pedido · Camisetas",
  description:
    "Crea hojas de pedido para proveedores y expórtalas como imagen PNG lista para enviar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
