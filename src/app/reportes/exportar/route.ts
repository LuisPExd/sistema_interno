import ExcelJS from "exceljs";
import { sesion } from "@/lib/acceso";
import { hoyEnPeru } from "@/lib/calendario";
import { PERIODOS, cargarAnalisis, leerPeriodo } from "@/lib/reportes-datos";
import { puede } from "@/lib/roles";

/** Instante ISO → fecha y hora de Perú como texto que Excel reconoce: "2026-10-10 15:45". */
function enPeru(instante: string | null): string {
  if (!instante) return "";
  return new Date(new Date(instante).getTime() - 5 * 3600000).toISOString().slice(0, 16).replace("T", " ");
}

type Columna = { header: string; key: string; width: number };

function hoja(libro: ExcelJS.Workbook, nombre: string, columnas: Columna[], filas: Record<string, unknown>[]) {
  const h = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  h.columns = columnas;
  h.addRows(filas);
  h.getRow(1).font = { bold: true };
  h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
}

/** Los datos de /reportes en un libro de Excel, una hoja por tabla, listos para otra herramienta. */
export async function GET(request: Request) {
  const rol = await sesion();
  if (!rol || !puede(rol, "reportes")) return new Response("No tienes acceso a los reportes.", { status: 403 });

  const periodo = leerPeriodo(new URL(request.url).searchParams.get("periodo"));
  const { reporte: r, planta } = await cargarAnalisis(periodo);
  const nombreArea = Object.fromEntries(r.areas.map((a) => [a.area, a.nombre]));

  const libro = new ExcelJS.Workbook();
  libro.created = new Date();

  hoja(
    libro,
    "Resumen por área",
    [
      { header: "Área", key: "nombre", width: 16 },
      { header: "Bloques terminados", key: "tramos", width: 20 },
      { header: "Prendas terminadas", key: "prendas", width: 20 },
      { header: "Capacidad por día (prendas)", key: "capacidadDia", width: 26 },
      { header: "Uso de capacidad %", key: "usoPct", width: 20 },
      { header: "Bloques con tiempo medido (incluye los en proceso que ya se pasaron)", key: "medidos", width: 34 },
      { header: "Horas reales", key: "horasReales", width: 14 },
      { header: "Horas planificadas", key: "horasPlan", width: 20 },
      { header: "Desviación %", key: "desviacion", width: 14 },
      { header: "Horas de retraso", key: "horasDeRetraso", width: 18 },
      { header: "Bloques con retraso", key: "retrasados", width: 20 },
      { header: "Espera media por bloque (h)", key: "esperaMedia", width: 26 },
      { header: "Proceso medio por bloque (h)", key: "procesoMedio", width: 26 },
      { header: "Detenido medio por bloque (h)", key: "detenidoMedio", width: 28 },
      { header: "Problemas", key: "problemas", width: 12 },
      { header: "Horas con algo detenido", key: "horasDetenida", width: 24 },
      { header: "Área crítica", key: "critica", width: 14 },
    ],
    r.areas.map((a) => ({
      ...a,
      desviacion: a.desviacion === null ? null : Math.round(a.desviacion * 100),
      usoPct: Math.round(a.uso * 1000) / 10,
      critica: r.critica?.area === a.area ? "Sí" : "",
    })),
  );

  hoja(
    libro,
    "Pedidos en planta",
    [
      { header: "Pedido", key: "codigo", width: 10 },
      { header: "Cliente", key: "cliente", width: 28 },
      { header: "Detalle", key: "resumen", width: 44 },
      { header: "Prendas", key: "prendas", width: 10 },
      { header: "Avance %", key: "avance", width: 10 },
      { header: "Estado", key: "estado", width: 16 },
      { header: "Dónde está", key: "areas", width: 24 },
      { header: "Urgente", key: "urgente", width: 9 },
      { header: "Detenido", key: "detenido", width: 10 },
      { header: "Prometido", key: "fechaPrometida", width: 12 },
      { header: "Termina producción", key: "fechaEstimada", width: 20 },
      { header: "Margen (días hábiles)", key: "margenDias", width: 22 },
      { header: "Semáforo", key: "semaforo", width: 10 },
    ],
    planta.pedidos.map((p) => ({
      ...p,
      areas: p.areas.join(", "),
      urgente: p.urgente ? "Sí" : "",
      detenido: p.detenido ? "Sí" : "",
    })),
  );

  hoja(
    libro,
    "Carga por área",
    [
      { header: "Área", key: "nombre", width: 16 },
      { header: "Prendas encima", key: "prendas", width: 16 },
      { header: "Bloques en proceso", key: "enProceso", width: 20 },
      { header: "Bloques en cola", key: "enCola", width: 16 },
      { header: "Días para vaciarse", key: "dias", width: 20 },
    ],
    planta.carga.map((c) => ({ ...c, dias: Math.round(c.dias * 10) / 10 })),
  );

  hoja(
    libro,
    "Producción",
    [
      { header: r.unidad === "mes" ? "Mes" : r.unidad === "semana" ? "Semana del" : "Día", key: "periodo", width: 14 },
      { header: "Días trabajados", key: "diasHabiles", width: 16 },
      { header: "Área", key: "area", width: 16 },
      { header: "Prendas terminadas", key: "prendas", width: 20 },
    ],
    r.cubetas.flatMap((c, i) =>
      r.areas.map((a) => ({ periodo: c.clave, diasHabiles: c.diasHabiles, area: a.nombre, prendas: r.produccion[a.area][i] })),
    ),
  );

  hoja(
    libro,
    "Por tipo de prenda",
    [
      { header: "Prenda", key: "prenda", width: 34 },
      { header: "Prendas aceptadas", key: "aceptadas", width: 18 },
      { header: "Prendas terminadas", key: "terminadas", width: 20 },
    ],
    r.porPrenda,
  );

  hoja(
    libro,
    "Aceptado y pendiente",
    [
      { header: r.unidad === "mes" ? "Mes" : r.unidad === "semana" ? "Semana del" : "Día", key: "periodo", width: 14 },
      { header: "Días trabajados", key: "diasHabiles", width: 16 },
      { header: "Prendas aceptadas", key: "aceptadas", width: 18 },
      { header: "Prendas terminadas", key: "terminadas", width: 20 },
      { header: "Prendas pendientes al cierre", key: "pendiente", width: 28 },
    ],
    r.cubetas.map((c, i) => ({
      periodo: c.clave,
      diasHabiles: c.diasHabiles,
      aceptadas: r.aceptadas[i],
      terminadas: r.produccion.acabados[i],
      pendiente: r.pendiente[i],
    })),
  );

  hoja(
    libro,
    "Entregas",
    [
      { header: "Pedido", key: "pedido", width: 10 },
      { header: "Cliente", key: "cliente", width: 28 },
      { header: "Prometido al confirmar", key: "prometido", width: 22 },
      { header: "Reprogramado", key: "reprogramado", width: 14 },
      { header: "Quedó listo", key: "listo", width: 12 },
      { header: "A tiempo", key: "aTiempo", width: 10 },
      { header: "Entregado al cliente", key: "entregado", width: 20 },
    ],
    r.entregas.map((x) => ({
      ...x,
      reprogramado: x.reprogramado ? "Sí" : "",
      aTiempo: x.aTiempo === null ? "" : x.aTiempo ? "Sí" : "No",
    })),
  );

  hoja(
    libro,
    "Problemas por mes",
    [
      { header: "Mes", key: "mes", width: 12 },
      { header: "Área", key: "area", width: 16 },
      { header: "Problemas", key: "problemas", width: 12 },
    ],
    r.meses.flatMap((mes, i) =>
      r.areas.map((a) => ({ mes, area: a.nombre, problemas: r.problemasPorMes[a.area][i] })),
    ),
  );

  hoja(
    libro,
    "Problemas",
    [
      { header: "Reportado", key: "reportado", width: 18 },
      { header: "Resuelto", key: "resuelto", width: 18 },
      { header: "Área", key: "area", width: 16 },
      { header: "Pedido", key: "pedido", width: 10 },
      { header: "Bloque", key: "bloque", width: 8 },
      { header: "Cliente", key: "cliente", width: 28 },
      { header: "Motivo", key: "motivo", width: 22 },
      { header: "Detalle", key: "detalle", width: 40 },
      { header: "Horas detenido", key: "horasDetenido", width: 16 },
    ],
    r.problemas.map((p) => ({
      ...p,
      area: nombreArea[p.area],
      reportado: enPeru(p.reportado),
      resuelto: enPeru(p.resuelto),
    })),
  );

  hoja(
    libro,
    "Tiempos por bloque",
    [
      { header: "Terminó", key: "fin", width: 18 },
      { header: "Empezó", key: "inicio", width: 18 },
      { header: "Llegó al área", key: "llegada", width: 18 },
      { header: "Área", key: "area", width: 16 },
      { header: "Pedido", key: "pedido", width: 10 },
      { header: "Bloque", key: "bloque", width: 8 },
      { header: "Cliente", key: "cliente", width: 28 },
      { header: "Prenda", key: "prenda", width: 28 },
      { header: "Cantidad", key: "cantidad", width: 10 },
      { header: "Horas de espera", key: "horasEspera", width: 16 },
      { header: "Horas reales", key: "horasReales", width: 14 },
      { header: "Horas detenido", key: "horasDetenido", width: 16 },
      { header: "Horas planificadas", key: "horasPlan", width: 20 },
      { header: "Diferencia (h)", key: "diferencia", width: 14 },
      { header: "Horas de reloj (sin repartir)", key: "horasReloj", width: 26 },
      { header: "Sigue en proceso", key: "enCurso", width: 16 },
    ],
    [...r.tramos, ...r.enCurso].map((t) => ({
      ...t,
      enCurso: t.enCurso ? "Sí" : "",
      area: nombreArea[t.area],
      inicio: enPeru(t.inicio),
      llegada: enPeru(t.llegada),
      fin: t.enCurso ? "" : enPeru(t.fin),
      diferencia: t.horasReales === null ? null : Math.round((t.horasReales - t.horasPlan) * 10) / 10,
    })),
  );

  hoja(
    libro,
    "Motivos",
    [
      { header: "Motivo", key: "motivo", width: 28 },
      { header: "Veces", key: "veces", width: 10 },
    ],
    r.motivos,
  );

  const archivo = `corpotex-reportes-${PERIODOS[periodo].dias}-dias-${hoyEnPeru()}.xlsx`;
  return new Response(await libro.xlsx.writeBuffer(), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
