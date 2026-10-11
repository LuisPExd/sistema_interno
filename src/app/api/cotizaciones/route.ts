import { randomBytes } from "node:crypto";
import { esHabil, hoyEnPeru } from "@/lib/calendario";
import { db } from "@/lib/db";
import { json, leerJson, preflight, respuestaDeError } from "@/lib/http";
import { cargarCola } from "@/lib/planta";
import { estimar, trabajoDesdeItems } from "@/lib/simulador";
import { ErrorDeDatos, validarItems, type ItemCotizado } from "@/lib/validar";

export const OPTIONS = preflight;

const INTENTOS = 5;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function texto(x: unknown, largo = 200): string | null {
  return typeof x === "string" && x.trim() !== "" ? x.trim().slice(0, largo) : null;
}

/** La fecha que pide el cliente no puede ser anterior a lo que la planta puede cumplir, ni caer en domingo. */
async function validarFechaDeseada(fecha: string, items: ItemCotizado[]) {
  if (!ES_FECHA.test(fecha) || Number.isNaN(Date.parse(fecha))) throw new ErrorDeDatos("fecha_deseada debe tener el formato AAAA-MM-DD.");
  if (!esHabil(fecha)) throw new ErrorDeDatos("La fecha deseada no puede ser domingo: se entrega de lunes a sábado.");
  const minima = estimar(await cargarCola(), trabajoDesdeItems("simulacion", items), hoyEnPeru()).fecha_estimada;
  if (fecha < minima) throw new ErrorDeDatos(`La fecha deseada no puede ser anterior al ${minima}, que es lo que la planta puede cumplir hoy.`);
}

/** Si ya llegó una cotización con esa clave contra duplicados, se devuelve la misma en vez de crear otra. */
async function yaRegistrada(claveIdempotencia: string | null) {
  if (!claveIdempotencia) return null;
  const { data, error } = await db()
    .from("cotizaciones")
    .select("codigo, clave")
    .eq("clave_idempotencia", claveIdempotencia)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(request: Request) {
  try {
    const cuerpo = await leerJson(request);
    const cliente = (cuerpo.cliente ?? {}) as Record<string, unknown>;
    const nombre = texto(cliente.nombre);
    const telefono = texto(cliente.telefono, 30);
    if (!nombre || !telefono) throw new ErrorDeDatos("Faltan cliente.nombre y cliente.telefono.");

    const items = validarItems(cuerpo.items, { exigirTallas: true });
    const fechaDeseada = texto(cuerpo.fecha_deseada, 10);
    if (fechaDeseada) await validarFechaDeseada(fechaDeseada, items);

    const claveIdempotencia = texto(cuerpo.clave_idempotencia, 80);
    const previa = await yaRegistrada(claveIdempotencia);
    if (previa) return json(previa, 200);

    const fila = {
      cliente: { nombre, telefono, empresa: texto(cliente.empresa) },
      items,
      precio_total: typeof cuerpo.precio_total === "number" && cuerpo.precio_total >= 0 ? cuerpo.precio_total : null,
      fecha_estimada: texto(cuerpo.fecha_estimada, 10),
      fecha_deseada: fechaDeseada,
      clave_idempotencia: claveIdempotencia,
      origen: cuerpo.origen === "chatbot" ? "chatbot" : "web",
      marca: texto(cuerpo.marca, 40),
      campana: texto(cuerpo.campana, 80),
      // Los códigos se pueden adivinar: la clave es lo que deja al cliente consultar su cotización.
      clave: randomBytes(12).toString("base64url"),
    };

    // El código es corto para que ventas lo teclee; si ya existe se sortea otro.
    for (let i = 0; i < INTENTOS; i++) {
      const codigo = `COT-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await db().from("cotizaciones").insert({ codigo, ...fila });
      if (!error) return json({ codigo, clave: fila.clave }, 201);
      if (error.code !== "23505") throw new Error(error.message);
      // Puede haber chocado la clave contra duplicados y no el código: otra petición igual llegó a la vez.
      const gemela = await yaRegistrada(claveIdempotencia);
      if (gemela) return json(gemela, 200);
    }
    throw new Error("No se pudo generar un código de cotización libre.");
  } catch (e) {
    return respuestaDeError(e);
  }
}
