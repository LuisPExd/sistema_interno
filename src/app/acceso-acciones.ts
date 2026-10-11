"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  ETIQUETA_ACCESOS,
  abrirSesion,
  anotarFallo,
  borrarFallos,
  cerrarSesion,
  exigir,
  leerAccesos,
  minutosBloqueado,
} from "@/lib/acceso";
import { db } from "@/lib/db";
import { cifrarPin, coincidePin, pinValido } from "@/lib/pin";
import { esRol, inicioDe, nombreRol } from "@/lib/roles";

type Resultado = { ok: true } | { ok: false; error: string };

/** Comprueba el PIN y deja la tableta recordada en ese rol. Si acierta, lleva a su pantalla. */
export async function entrar(rol: string, pin: string): Promise<Resultado> {
  if (!esRol(rol) || !pinValido(pin)) return { ok: false, error: "PIN incorrecto." };

  const espera = minutosBloqueado(rol);
  if (espera) {
    return { ok: false, error: `Demasiados intentos. Espera ${espera} ${espera === 1 ? "minuto" : "minutos"}.` };
  }

  const acceso = (await leerAccesos())[rol];
  if (!acceso) return { ok: false, error: "Este acceso todavía no tiene PIN. Avisa al administrador." };

  if (!(await coincidePin(pin, acceso.pin))) {
    anotarFallo(rol);
    return { ok: false, error: "PIN incorrecto." };
  }
  borrarFallos(rol);
  await abrirSesion(rol, acceso.pin);
  redirect(inicioDe(rol));
}

export async function salir() {
  await cerrarSesion();
  redirect("/");
}

/**
 * Solo el administrador, y nunca sobre su propio acceso: el PIN del administrador se cambia
 * desde el servidor con "npm run pines -- admin", para que nadie que entre con él se lo quede.
 * Las tabletas que usaban el PIN anterior tendrán que volver a entrar.
 */
export async function cambiarPin(rol: string, pin: string): Promise<Resultado> {
  await exigir("accesos");
  if (!esRol(rol)) return { ok: false, error: "Ese acceso no existe." };
  if (rol === "admin") return { ok: false, error: "El PIN del administrador no se cambia desde aquí." };
  if (!pinValido(pin)) return { ok: false, error: "El PIN debe tener 4 números." };

  const cifrado = await cifrarPin(pin);
  const { error } = await db()
    .from("accesos")
    .upsert({ rol, pin: cifrado, actualizado_en: new Date().toISOString() });
  if (error) {
    console.error(error);
    return { ok: false, error: `No se pudo guardar el PIN de ${nombreRol(rol)}.` };
  }
  updateTag(ETIQUETA_ACCESOS);
  refresh();
  borrarFallos(rol);
  return { ok: true };
}
