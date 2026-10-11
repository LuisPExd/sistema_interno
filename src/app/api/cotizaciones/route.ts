import { db } from "@/lib/db";
import { json, leerJson, preflight, respuestaDeError } from "@/lib/http";
import { ErrorDeDatos, validarItems } from "@/lib/validar";

export const OPTIONS = preflight;

const INTENTOS = 5;

function texto(x: unknown): string | null {
  return typeof x === "string" && x.trim() !== "" ? x.trim() : null;
}

export async function POST(request: Request) {
  try {
    const cuerpo = await leerJson(request);
    const cliente = (cuerpo.cliente ?? {}) as Record<string, unknown>;
    const nombre = texto(cliente.nombre);
    const telefono = texto(cliente.telefono);
    if (!nombre || !telefono) throw new ErrorDeDatos("Faltan cliente.nombre y cliente.telefono.");

    const fila = {
      cliente: { nombre, telefono, empresa: texto(cliente.empresa) },
      items: validarItems(cuerpo.items, { exigirTallas: true }),
      precio_total: typeof cuerpo.precio_total === "number" ? cuerpo.precio_total : null,
      fecha_estimada: texto(cuerpo.fecha_estimada),
    };

    // El código es corto para que ventas lo teclee; si ya existe se sortea otro.
    for (let i = 0; i < INTENTOS; i++) {
      const codigo = `COT-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await db().from("cotizaciones").insert({ codigo, ...fila });
      if (!error) return json({ codigo }, 201);
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("No se pudo generar un código de cotización libre.");
  } catch (e) {
    return respuestaDeError(e);
  }
}
