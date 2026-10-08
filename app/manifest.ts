import type { MetadataRoute } from "next";

/** Permite instalar el inventario como app («Añadir a pantalla de inicio»). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Camisetas · Inventario",
    short_name: "Inventario",
    description: "Inventario, ventas y pedidos de camisetas.",
    start_url: "/inventario",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f4f5",
    theme_color: "#18181b",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
