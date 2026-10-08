import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Generador de Hojas de Pedido · Camisetas",
  description:
    "Crea hojas de pedido para proveedores y expórtalas como imagen PNG lista para enviar.",
  // iPhone: al «Añadir a pantalla de inicio» se abre como app, sin barras de Safari.
  appleWebApp: { capable: true, title: "Inventario", statusBarStyle: "default" },
  icons: { icon: "/pwa-icon/192", apple: "/pwa-icon/180" },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
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
