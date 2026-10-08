import { getPhoto } from "../../../inventario/store";

export const dynamic = "force-dynamic";

/**
 * Foto de una camiseta. Pública (la usa también el catálogo) y cacheable para
 * siempre: la URL lleva ?v=<versión>, que cambia cuando cambia la foto.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const photo = await getPhoto(decodeURIComponent(id).slice(0, 80));
    const match = photo?.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
    if (!match) return new Response("No encontrada", { status: 404 });
    return new Response(Buffer.from(match[2], "base64"), {
      headers: {
        "content-type": match[1],
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}
