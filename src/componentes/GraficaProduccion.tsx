import type { AreaId } from "@/lib/catalogo";
import type { Reporte } from "@/lib/reportes";
import { GraficaColumnas } from "./GraficaColumnas";

const AZUL = "#2a78d6";

/** Prendas que salieron de un área en cada periodo, frente a lo que esa área puede sacar por día. */
export function GraficaProduccion({ reporte: r, area }: { reporte: Reporte; area: AreaId }) {
  const resumen = r.areas.find((a) => a.area === area)!;
  const totales = r.produccion[area];
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
      notas={porDia ? totales.map((v) => `${v} prendas en ${r.unidad === "semana" ? "la semana" : "el mes"}`) : undefined}
      referencia={
        resumen.capacidadDia ? { valor: resumen.capacidadDia, texto: `Capacidad: ${resumen.capacidadDia} por día` } : undefined
      }
      unidad={porDia ? `Promedio de prendas por día trabajado, por ${r.unidad}` : "Prendas por día"}
    />
  );
}
