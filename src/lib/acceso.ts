// Acceso por PIN (HANDOFF D7): un PIN de 4 dígitos por área y por rol de oficina.
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { firmar, mismaFirma } from "./pin";
import { esRol, puede, type Rol, type Zona } from "./roles";

export const ETIQUETA_ACCESOS = "accesos";
const GALLETA = "corpotex_acceso";
const UN_ANIO = 60 * 60 * 24 * 365;

export type Acceso = { pin: string; actualizado: string };

/** PIN cifrados por rol. Se guardan en memoria del servidor; cambiar un PIN los invalida. */
export async function leerAccesos(): Promise<Partial<Record<Rol, Acceso>>> {
  "use cache";
  cacheTag(ETIQUETA_ACCESOS);
  cacheLife({ revalidate: 30, expire: 300 });

  const { data, error } = await db().from("accesos").select("rol, pin, actualizado_en");
  if (error) throw new Error(error.message);
  const accesos: Partial<Record<Rol, Acceso>> = {};
  for (const fila of data ?? []) {
    if (esRol(fila.rol)) accesos[fila.rol] = { pin: fila.pin, actualizado: fila.actualizado_en };
  }
  return accesos;
}

function secreto(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY!;
}

/** Rol con el que entró esta tableta o computadora, o null si no ha entrado. */
export async function sesion(): Promise<Rol | null> {
  const valor = (await cookies()).get(GALLETA)?.value;
  if (!valor) return null;
  const corte = valor.indexOf(".");
  const rol = valor.slice(0, corte);
  if (corte < 0 || !esRol(rol)) return null;
  const acceso = (await leerAccesos())[rol];
  if (!acceso) return null;
  return mismaFirma(valor.slice(corte + 1), firmar(secreto(), rol, acceso.pin)) ? rol : null;
}

export async function abrirSesion(rol: Rol, pinCifrado: string) {
  (await cookies()).set(GALLETA, `${rol}.${firmar(secreto(), rol, pinCifrado)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: UN_ANIO,
    path: "/",
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(GALLETA);
}

/** Para páginas y acciones: quien no tiene permiso vuelve al inicio, donde se pide el PIN. */
export async function exigir(zona: Zona): Promise<Rol> {
  const rol = await sesion();
  if (!rol || !puede(rol, zona)) redirect("/");
  return rol;
}

// ---------- Intentos fallidos ----------
// Se cuentan por rol y no por dirección, porque la dirección se puede falsear.

const MAX_FALLOS = 5;
const BLOQUEO_MS = 5 * 60 * 1000;
const fallos = new Map<Rol, { veces: number; hasta: number }>();

/** Minutos que faltan para volver a intentar, o 0 si no está bloqueado. */
export function minutosBloqueado(rol: Rol): number {
  const f = fallos.get(rol);
  if (!f || f.hasta <= Date.now()) return 0;
  return Math.ceil((f.hasta - Date.now()) / 60000);
}

export function anotarFallo(rol: Rol) {
  const f = fallos.get(rol) ?? { veces: 0, hasta: 0 };
  f.veces += 1;
  if (f.veces >= MAX_FALLOS) {
    f.veces = 0;
    f.hasta = Date.now() + BLOQUEO_MS;
  }
  fallos.set(rol, f);
}

export function borrarFallos(rol: Rol) {
  fallos.delete(rol);
}
