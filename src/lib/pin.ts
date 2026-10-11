// Cifrado de los PIN. Sin dependencias del servidor web: lo usan el sistema y scripts/pines.ts.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derivar = promisify(scrypt) as (clave: string, sal: Buffer, largo: number) => Promise<Buffer>;

export function pinValido(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** Devuelve "sal:resumen" en hexadecimal; el PIN no se puede recuperar a partir de esto. */
export async function cifrarPin(pin: string): Promise<string> {
  const sal = randomBytes(16);
  const resumen = await derivar(pin, sal, 32);
  return `${sal.toString("hex")}:${resumen.toString("hex")}`;
}

export async function coincidePin(pin: string, cifrado: string): Promise<boolean> {
  const [sal, resumen] = cifrado.split(":");
  if (!sal || !resumen) return false;
  const esperado = Buffer.from(resumen, "hex");
  const obtenido = await derivar(pin, Buffer.from(sal, "hex"), esperado.length || 32);
  return esperado.length === obtenido.length && timingSafeEqual(esperado, obtenido);
}

/**
 * Firma de la sesión de un rol. Depende del PIN cifrado: al cambiar el PIN,
 * las tabletas que entraron con el anterior quedan fuera.
 */
export function firmar(secreto: string, rol: string, cifrado: string): string {
  return createHmac("sha256", secreto).update(`${rol}:${cifrado}`).digest("base64url");
}

export function mismaFirma(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
