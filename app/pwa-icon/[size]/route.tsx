import { ImageResponse } from "next/og";

/** Icono de la app instalada (192 y 512 px), dibujado al vuelo. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = raw === "512" ? 512 : raw === "180" ? 180 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          fontSize: size * 0.62,
        }}
      >
        👕
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "cache-control": "public, max-age=604800, immutable" },
    },
  );
}
