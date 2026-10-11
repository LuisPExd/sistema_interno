import type { AreaId } from "@/lib/catalogo";
import type { Reporte } from "@/lib/reportes";
import { GraficaColumnas } from "./GraficaColumnas";

const AZUL = "#2a78d6";

const DESFASE_PERU = 5 * 3600000;

/**
 * Prendas que salieron de un área en cada periodo, frente a lo que esa área puede sacar por día.
 * Con `planta`, la referencia es lo que puede sacar la planta entera: la fija su área más lenta.
 */
export function GraficaProduccion({ reporte: r, area, planta }: { reporte: Reporte; area: AreaId; planta?: boolean }) {
  const resumen = r.areas.find((a) => a.area === area)!;
  const totales = r.produccion[area];
  const capacidad = planta ? r.capacidadPlanta?.prendasDia : resumen.capacidadDia;
  const limita = planta && r.capacidadPlanta ? r.areas.find((a) => a.area === r.capacidadPlanta!.limita)?.nombre : null;
  const hoy = new Date(new Date(r.hasta).getTime() - DESFASE_PERU).toISOString().slice(0, 10);
  if (totales.every((v) => v === 0)) {
    return (
      <p className="rounded-xl bg-gray-100 p-4 text-base text-gray-600">
        {resumen.nombre} todavía no terminó ningún bloque en este periodo.
      </p>
    );
  }
  const porDia = r.unidad !== "día";
  return (
    <GraficaColumnas
      descripcion={`Prendas terminadas en ${resumen.nombre} por ${r.unidad}`}
      etiquetas={r.cubetas.map((c) => c.etiqueta)}
      // En semanas y meses se muestra el promedio por día trabajado, para poder compararlo con la capacidad.
      series={[
        {
          nombre: porDia ? "Prendas por día" : "Prendas terminadas",
          color: AZUL,
          valores: totales.map((v, i) => (porDia ? Math.round((v / r.cubetas[i].diasHabiles) * 10) / 10 : v)),
        },
      ]}
      notas={
        porDia
          ? totales.map((v) => `${v} prendas en ${r.unidad === "semana" ? "la semana" : "el mes"}`)
          : r.cubetas.map((c) => (c.clave === hoy ? "Día en curso" : ""))
      }
      referencia={
        capacidad
          ? { valor: capacidad, texto: `Capacidad: ${capacidad} por día${limita ? ` (limita ${limita})` : ""}` }
          : undefined
      }
      unidad={porDia ? `Promedio de prendas por día trabajado, por ${r.unidad}` : "Prendas por día"}
    />
  );
}
