const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** "2026-10-22" → "jue 22 oct" */
export function fechaCorta(fecha: string | null): string {
  if (!fecha) return "—";
  const d = new Date(`${fecha}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function horasEnTexto(horas: number): string {
  if (horas < 1) return `${Math.max(5, Math.round((horas * 60) / 5) * 5)} min`;
  if (horas < 8) return `${Math.round(horas)} h`;
  const dias = horas / 8;
  return `${dias.toFixed(1).replace(".", ",").replace(",0", "")} ${dias < 1.05 ? "día" : "días"}`;
}

export function margenEnTexto(dias: number | null): string {
  if (dias === null) return "";
  if (dias < 0) return `${-dias} ${dias === -1 ? "día" : "días"} tarde`;
  if (dias === 0) return "sin margen";
  return `${dias} ${dias === 1 ? "día" : "días"} de margen`;
}

/** Instante ISO → "sáb 10 oct, 3:45 p. m." en hora de Perú. */
export function fechaHora(instante: string): string {
  const d = new Date(new Date(instante).getTime() - 5 * 3600000);
  const h = d.getUTCHours();
  const hora = `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
  return `${fechaCorta(d.toISOString().slice(0, 10))}, ${hora}`;
}
