// Lee de Supabase lo que necesita el análisis de producción y lo pasa al cálculo de reportes.ts.
import "server-only";
import { connection } from "next/server";
import { db } from "./db";
import { cargarPedidos, cargarPlanta, leerTodo, type PedidoFila, type Planta } from "./planta";
import { calcularReporte, type EventoReporte, type PedidoReporte, type Reporte } from "./reportes";

export const PERIODOS = {
  "7": { dias: 7, nombre: "7 días" },
  "30": { dias: 30, nombre: "30 días" },
  "90": { dias: 90, nombre: "3 meses" },
  "365": { dias: 365, nombre: "12 meses" },
} as const;
export type Periodo = keyof typeof PERIODOS;

export function leerPeriodo(x: string | null | undefined): Periodo {
  return x && x in PERIODOS ? (x as Periodo) : "30";
}

const DIA_MS = 24 * 3600000;
// Un bloque que terminó al inicio del periodo pudo llegar y empezar semanas antes.
const DIAS_PREVIOS = 45;
const PAGINA = 1000;

function aReporte(p: PedidoFila): PedidoReporte {
  return {
    id: p.id,
    codigo: p.codigo,
    cliente: p.cliente_empresa || p.cliente_nombre,
    creado_en: p.creado_en,
    fecha_prometida: p.fecha_prometida,
    items: p.pedido_items,
    bloques: p.bloques,
  };
}

async function cargarEventos(desde: string): Promise<EventoReporte[]> {
  const eventos: EventoReporte[] = [];
  // Supabase entrega como mucho 1000 filas por consulta.
  for (let i = 0; i < 100; i++) {
    const { data, error } = await db()
      .from("eventos")
      .select("pedido_id, bloque_id, area, tipo, detalle, creado_en")
      .gte("creado_en", desde)
      .order("creado_en")
      .order("id")
      .range(i * PAGINA, (i + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    eventos.push(...(data as EventoReporte[]));
    if (data.length < PAGINA) break;
  }
  return eventos;
}

export type Analisis = {
  /** Lo que pasó en el periodo. */
  reporte: Reporte;
  /** Cómo está la planta en este momento. */
  planta: Planta;
};

export async function cargarAnalisis(periodo: Periodo): Promise<Analisis> {
  await connection();
  const ahora = Date.now();
  const { dias } = PERIODOS[periodo];
  const [planta, pedidos, eventos] = await Promise.all([
    cargarPlanta(),
    // cargarPedidos también pone en uso la configuración de planta, de la que sale lo planificado.
    cargarPedidos(["confirmado", "en_produccion", "listo", "entregado"]),
    cargarEventos(new Date(ahora - (dias + DIAS_PREVIOS) * DIA_MS).toISOString()),
  ]);
  const reporte = calcularReporte(
    pedidos.map(aReporte),
    eventos,
    new Date(ahora - dias * DIA_MS).toISOString(),
    new Date(ahora).toISOString(),
  );
  return { reporte, planta };
}

/** Producción de las últimas dos semanas para el dashboard, con la lectura que ya está en memoria. */
export async function cargarProduccionReciente(): Promise<Reporte> {
  await connection();
  const ahora = Date.now();
  const { pedidos, eventos } = await leerTodo();
  return calcularReporte(
    pedidos.filter((p) => p.estado !== "cancelado").map(aReporte),
    eventos,
    new Date(ahora - 14 * DIA_MS).toISOString(),
    new Date(ahora).toISOString(),
  );
}
