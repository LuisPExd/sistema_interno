import { BUCKET_DISENOS, db } from "@/lib/db";
import { json, preflight, respuestaDeError } from "@/lib/http";
import { ErrorDeDatos } from "@/lib/validar";

export const OPTIONS = preflight;

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Vistas del modelo que genera la web: se guardan aparte de la ficha y se muestran a ventas y a cada área.
const VISTAS = ["frente", "media-lateral", "lateral", "espalda"];

/**
 * La web sube aquí el diseño del cliente; queda vinculado al código de cotización.
 * Con el campo "vista" (frente, media-lateral, lateral o espalda) sube una imagen del modelo en vez de la ficha.
 */
export async function POST(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  try {
    const codigo = (await params).codigo.toUpperCase();
    const formulario = await request.formData().catch(() => null);
    const archivo = formulario?.get("archivo");
    if (!(archivo instanceof File)) throw new ErrorDeDatos('Falta el archivo en el campo "archivo".');

    const extension = EXTENSIONES[archivo.type];
    if (!extension) throw new ErrorDeDatos("El diseño debe ser PNG, JPG, WEBP o PDF.");
    if (archivo.size > MAX_BYTES) throw new ErrorDeDatos("El diseño no puede pesar más de 10 MB.");

    const { data: cotizacion, error: errorBusqueda } = await db()
      .from("cotizaciones")
      .select("codigo")
      .eq("codigo", codigo)
      .maybeSingle();
    if (errorBusqueda) throw new Error(errorBusqueda.message);
    if (!cotizacion) return json({ error: `No existe la cotización ${codigo}.` }, 404);

    const vista = formulario?.get("vista");
    if (vista !== null && vista !== undefined) {
      if (typeof vista !== "string" || !VISTAS.includes(vista)) throw new ErrorDeDatos(`La vista debe ser una de: ${VISTAS.join(", ")}.`);
      if (extension === "pdf") throw new ErrorDeDatos("La vista del modelo debe ser una imagen.");
    }
    const ruta = vista ? `${codigo}/vista-${vista}.${extension}` : `${codigo}/diseno.${extension}`;
    const { error: errorSubida } = await db()
      .storage.from(BUCKET_DISENOS)
      .upload(ruta, archivo, { contentType: archivo.type, upsert: true });
    if (errorSubida) throw new Error(errorSubida.message);

    if (vista) return json({ codigo, vista, diseno: "guardado" }, 201);

    const { error } = await db().from("cotizaciones").update({ diseno_archivo: ruta }).eq("codigo", codigo);
    if (error) throw new Error(error.message);

    return json({ codigo, diseno: "guardado" }, 201);
  } catch (e) {
    return respuestaDeError(e);
  }
}
