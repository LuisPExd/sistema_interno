import ExcelJS from "exceljs";
import { sesion } from "@/lib/acceso";
import { hoyEnPeru } from "@/lib/calendario";
import { PERIODOS, cargarReporte, leerPeriodo } from "@/lib/reportes-datos";
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
  const r = await cargarReporte(periodo);
  const nombreArea = Object.fromEntries(r.areas.map((a) => [a.area, a.nombre]));

  const libro = new ExcelJS.Workbook();
  libro.created = new Date();

  hoja(
    libro,
    "Resumen por área",
    [
      { header: "Área", key: "nombre", width: 16 },
      { header: "Bloques terminados", key: "tramos", width: 20 },
      { header: "Horas reales", key: "horasReales", width: 14 },
      { header: "Horas planificadas", key: "horasPlan", width: 20 },
      { header: "Desviación %", key: "desviacion", width: 14 },
      { header: "Horas de retraso", key: "horasDeRetraso", width: 18 },
      { header: "Bloques con retraso", key: "retrasados", width: 20 },
      { header: "Problemas", key: "problemas", width: 12 },
      { header: "Horas detenida", key: "horasDetenida", width: 16 },
      { header: "Área crítica", key: "critica", width: 14 },
    ],
    r.areas.map((a) => ({
      ...a,
      desviacion: a.horasPlan > 0 ? Math.round((a.horasReales / a.horasPlan - 1) * 100) : null,
      critica: r.critica?.area === a.area ? "Sí" : "",
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
      { header: "Área", key: "area", width: 16 },
      { header: "Pedido", key: "pedido", width: 10 },
      { header: "Bloque", key: "bloque", width: 8 },
      { header: "Cliente", key: "cliente", width: 28 },
      { header: "Prenda", key: "prenda", width: 28 },
      { header: "Cantidad", key: "cantidad", width: 10 },
      { header: "Horas reales", key: "horasReales", width: 14 },
      { header: "Horas planificadas", key: "horasPlan", width: 20 },
      { header: "Diferencia (h)", key: "diferencia", width: 14 },
    ],
    r.tramos.map((t) => ({
      ...t,
      area: nombreArea[t.area],
      inicio: enPeru(t.inicio),
      fin: enPeru(t.fin),
      diferencia: Math.round((t.horasReales - t.horasPlan) * 10) / 10,
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
