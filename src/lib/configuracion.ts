// Valores de planta que el jefe de producción ajusta en /configuracion (HANDOFF sección 9).
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { VALORES_DE_FABRICA, aplicarValores, type ValoresPlanta } from "./catalogo";
import { db } from "./db";

export const ETIQUETA_CONFIGURACION = "configuracion";
export const CLAVE_PLANTA = "planta";

type Limite = { min: number; max: number };

/** Límites razonables: evitan que un dedo de más deje la planta con capacidad cero o infinita. */
export const LIMITES = {
  minutosPorDia: { min: 30, max: 6000 },
  almacenPrendasPorDia: { min: 10, max: 10000 },
  minutosPorPrenda: { min: 0.1, max: 600 },
  bloque: { min: 5, max: 1000 },
} satisfies Record<string, Limite>;

function numero(x: unknown, { min, max }: Limite, entero: boolean): number | null {
  if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max) return null;
  return entero ? Math.round(x) : Math.round(x * 100) / 100;
}

function objeto(x: unknown): Record<string, unknown> {
  return typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
}

/**
 * Completa lo guardado con los valores de fábrica. Devuelve también los campos que no pasan
 * los límites, para avisar al guardar; al leer simplemente se ignoran.
 */
export function completar(crudo: unknown): { valores: ValoresPlanta; rechazados: string[] } {
  const v = structuredClone(VALORES_DE_FABRICA);
  const rechazados: string[] = [];
  const c = objeto(crudo);
  const tomar = (
    origen: Record<string, unknown>,
    destino: Record<string, number>,
    campo: string,
    limite: Limite,
    nombre: string,
    entero = false,
  ) => {
    if (origen[campo] === undefined) return;
    const n = numero(origen[campo], limite, entero);
    if (n === null) rechazados.push(nombre);
    else destino[campo] = n;
  };

  for (const a of Object.keys(v.minutosPorDia)) {
    tomar(objeto(c.minutosPorDia), v.minutosPorDia, a, LIMITES.minutosPorDia, `capacidad de ${a}`, true);
  }
  const almacen = { almacenPrendasPorDia: v.almacenPrendasPorDia };
  tomar(c, almacen, "almacenPrendasPorDia", LIMITES.almacenPrendasPorDia, "capacidad de almacén", true);
  v.almacenPrendasPorDia = almacen.almacenPrendasPorDia;
  for (const p of Object.keys(v.personalizacion)) {
    tomar(objeto(c.personalizacion), v.personalizacion, p, LIMITES.minutosPorPrenda, `minutos de ${p}`);
  }
  const familias = objeto(c.familias);
  for (const [id, f] of Object.entries(v.familias)) {
    const origen = objeto(familias[id]);
    for (const etapa of ["corte", "confeccion", "acabados"] as const) {
      // Lo que no pasa por una etapa (comercializados en Corte y Confección) se queda en cero.
      if (f[etapa] === 0) continue;
      tomar(origen, f, etapa, LIMITES.minutosPorPrenda, `${etapa} de ${id}`);
    }
    tomar(origen, f, "bloque", LIMITES.bloque, `bloque de ${id}`, true);
  }
  return { valores: v, rechazados };
}

/** Lo guardado en la base, o null si no hay nada (o la tabla todavía no existe). */
export async function leerConfiguracion(): Promise<{ valor: unknown; actualizado: string } | null> {
  "use cache";
  cacheTag(ETIQUETA_CONFIGURACION);
  cacheLife({ revalidate: 30, expire: 300 });

  const { data, error } = await db()
    .from("configuracion")
    .select("valor, actualizado_en")
    .eq("clave", CLAVE_PLANTA)
    .maybeSingle();
  if (error || !data) return null;
  return { valor: data.valor, actualizado: data.actualizado_en };
}

/** Pone en uso los valores guardados. Se llama antes de cualquier cálculo de planta. */
export async function usarConfiguracion(): Promise<ValoresPlanta> {
  const guardado = await leerConfiguracion();
  const { valores } = completar(guardado?.valor);
  aplicarValores(valores);
  return valores;
}
