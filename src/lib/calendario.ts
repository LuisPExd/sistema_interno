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
