import { ErrorDeDatos } from "./validar";

// La página web vive en otro dominio (PARA-EQUIPO-WEB.md, sección 3).
const CORS = {
  "Access-Control-Allow-Origin": process.env.WEB_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(datos: unknown, status = 200): Response {
  return Response.json(datos, { status, headers: CORS });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

export async function leerJson(request: Request): Promise<Record<string, unknown>> {
  const cuerpo: unknown = await request.json().catch(() => null);
  if (typeof cuerpo !== "object" || cuerpo === null || Array.isArray(cuerpo)) {
    throw new ErrorDeDatos("El cuerpo debe ser un objeto JSON.");
  }
  return cuerpo as Record<string, unknown>;
}

/** Los errores de datos van como 400 con mensaje legible; el resto como 500. */
export function respuestaDeError(e: unknown): Response {
  if (e instanceof ErrorDeDatos) return json({ error: e.message }, 400);
  console.error(e);
  return json({ error: "Error interno del sistema." }, 500);
}
