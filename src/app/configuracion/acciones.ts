"use server";

import { refresh, updateTag } from "next/cache";
import { exigir } from "@/lib/acceso";
import { CLAVE_PLANTA, ETIQUETA_CONFIGURACION, completar } from "@/lib/configuracion";
import { db } from "@/lib/db";
import { ETIQUETA_PLANTA } from "@/lib/planta";

type Resultado = { ok: true } | { ok: false; error: string };

const SIN_TABLA = 'No se pudo guardar. Revisa que exista la tabla "configuracion" en Supabase.';

function actualizar() {
  updateTag(ETIQUETA_CONFIGURACION);
  updateTag(ETIQUETA_PLANTA);
  refresh();
}

/** Guarda capacidades, minutos por prenda y tamaños de bloque. Las estimaciones cambian al instante. */
export async function guardarConfiguracion(entrada: unknown): Promise<Resultado> {
  await exigir("configuracion");
  const { valores, rechazados } = completar(entrada);
  if (rechazados.length) {
    return { ok: false, error: `Hay valores fuera de rango: ${rechazados.slice(0, 4).join(", ")}.` };
  }
  const { error } = await db()
    .from("configuracion")
    .upsert({ clave: CLAVE_PLANTA, valor: valores, actualizado_en: new Date().toISOString() });
  if (error) {
    console.error(error);
    return { ok: false, error: SIN_TABLA };
  }
  actualizar();
  return { ok: true };
}

/** Borra los ajustes: la planta vuelve a los valores calibrados del HANDOFF. */
export async function restaurarConfiguracion(): Promise<Resultado> {
  await exigir("configuracion");
  const { error } = await db().from("configuracion").delete().eq("clave", CLAVE_PLANTA);
  if (error) {
    console.error(error);
    return { ok: false, error: SIN_TABLA };
  }
  actualizar();
  return { ok: true };
}
