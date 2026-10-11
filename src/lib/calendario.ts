// Días hábiles: lunes a sábado (HANDOFF.md, sección 6). Feriados fuera del MVP.
// Las fechas se manejan como texto "AAAA-MM-DD" para no depender de la zona horaria.

function aUTC(fecha: string): Date {
  return new Date(`${fecha}T00:00:00Z`);
}

function aTexto(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function esHabil(fecha: string): boolean {
  return aUTC(fecha).getUTCDay() !== 0;
}

/** Fecha del día hábil número `n` contando desde el día siguiente a `desde` (n = 1 es el próximo día hábil). */
export function diaHabil(desde: string, n: number): string {
  const d = aUTC(desde);
  for (let faltan = Math.max(1, n); faltan > 0; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) faltan--;
  }
  return aTexto(d);
}

/** Días hábiles entre `desde` (sin contarlo) y `hasta` (contándolo). Negativo si `hasta` es anterior. */
export function diasHabilesEntre(desde: string, hasta: string): number {
  if (hasta < desde) return -diasHabilesEntre(hasta, desde);
  const d = aUTC(desde);
  const fin = aUTC(hasta);
  let n = 0;
  while (d < fin) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) n++;
  }
  return n;
}

/** Fecha de hoy en Perú (UTC-5, sin horario de verano). */
export function hoyEnPeru(): string {
  return aTexto(new Date(Date.now() - 5 * 60 * 60 * 1000));
}

const HORA_INICIO = 8;
export const HORAS_POR_DIA = 8;

/** Horas de trabajo transcurridas entre dos instantes: lunes a sábado, de 8:00 a 16:00 hora de Perú. */
export function horasHabilesEntre(inicio: Date, fin: Date): number {
  const DESFASE = 5 * 60 * 60 * 1000;
  // Se trabaja con relojes "de Perú" guardados como si fueran UTC.
  const a = inicio.getTime() - DESFASE;
  const b = fin.getTime() - DESFASE;
  if (b <= a) return 0;
  const dia = new Date(a);
  dia.setUTCHours(0, 0, 0, 0);
  let horas = 0;
  for (let i = 0; i < 90 && dia.getTime() < b; i++, dia.setUTCDate(dia.getUTCDate() + 1)) {
    if (dia.getUTCDay() === 0) continue;
    const abre = dia.getTime() + HORA_INICIO * 3600000;
    const cierra = abre + HORAS_POR_DIA * 3600000;
    horas += Math.max(0, Math.min(b, cierra) - Math.max(a, abre)) / 3600000;
  }
  return horas;
}
