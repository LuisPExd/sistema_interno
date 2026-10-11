// Historia mensual SIMULADA para la gráfica del dashboard.
// El sistema todavía no tiene meses de historial real; cuando los tenga, esta función
// se reemplaza por una consulta a los pedidos entregados.

import { AREAS } from "./catalogo";

const DIAS_HABILES_MES = 26;
// Minutos de Confección de una prenda promedio (entre un polo y una camisa).
const MINUTOS_PRENDA_PROMEDIO = 20;

/** Prendas que la planta puede sacar en un mes; Confección es el cuello de botella. */
export const CAPACIDAD_MENSUAL =
  Math.round((AREAS.confeccion.minutosPorDia * DIAS_HABILES_MES) / MINUTOS_PRENDA_PROMEDIO / 10) * 10;

export type MesHistoria = {
  /** "2026-09" */
  mes: string;
  etiqueta: string;
  aceptadas: number;
  aTiempo: number;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

// Demanda de cada mes frente a la capacidad: sube en campañas (julio, octubre por el
// Señor Cautivo, diciembre) y baja a inicios de año.
const ESTACIONALIDAD = [0.72, 0.68, 0.85, 0.8, 0.92, 0.88, 1.08, 0.95, 1.12, 1.27, 0.98, 1.18];

/** Variación fija por mes, para que la gráfica no cambie cada vez que se recarga. */
function ruido(anio: number, mes: number): number {
  const x = Math.sin(anio * 12.9898 + mes * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 0.12 - 0.06;
}

/** Los 12 meses completos anteriores a `hoy` ("AAAA-MM-DD"). */
export function historiaMensual(hoy: string): MesHistoria[] {
  const anioHoy = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7)) - 1;
  const meses: MesHistoria[] = [];
  for (let atras = 12; atras >= 1; atras--) {
    const indice = anioHoy * 12 + mesHoy - atras;
    const anio = Math.floor(indice / 12);
    const mes = indice % 12;
    const aceptadas = Math.round((CAPACIDAD_MENSUAL * (ESTACIONALIDAD[mes] + ruido(anio, mes))) / 10) * 10;
    // Lo que pasa de la capacidad no puede salir a tiempo; del resto siempre se atrasa un poco.
    const cumplimiento = 0.94 + ruido(anio, mes + 7) / 2;
    const aTiempo = Math.round((Math.min(aceptadas, CAPACIDAD_MENSUAL) * cumplimiento) / 10) * 10;
    meses.push({
      mes: `${anio}-${String(mes + 1).padStart(2, "0")}`,
      etiqueta: `${MESES[mes]} ${String(anio).slice(2)}`,
      aceptadas,
      aTiempo,
    });
  }
  return meses;
}
