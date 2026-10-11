// Lee de Supabase lo que necesitan los reportes y lo pasa al cálculo de reportes.ts.
import "server-only";
import { connection } from "next/server";
import { db } from "./db";
import { cargarPedidos } from "./planta";
import { calcularReporte, type EventoReporte, type Reporte } from "./reportes";

export const PERIODOS = {
  "30": { dias: 30, nombre: "Últimos 30 días" },
  "90": { dias: 90, nombre: "Últimos 3 meses" },
  "365": { dias: 365, nombre: "Últimos 12 meses" },
} as const;
export type Periodo = keyof typeof PERIODOS;

export function leerPeriodo(x: string | null | undefined): Periodo {
  return x && x in PERIODOS ? (x as Periodo) : "30";
}

const DIA_MS = 24 * 3600000;
// Un bloque que terminó al inicio del periodo pudo empezar semanas antes.
const DIAS_PREVIOS = 45;
const PAGINA = 1000;

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

export async function cargarReporte(periodo: Periodo): Promise<Reporte> {
  await connection();
  const ahora = Date.now();
  const desde = new Date(ahora - PERIODOS[periodo].dias * DIA_MS).toISOString();
  const [pedidos, eventos] = await Promise.all([
    // cargarPedidos también pone en uso la configuración de planta, de la que sale lo planificado.
    cargarPedidos(["confirmado", "en_produccion", "listo", "entregado"]),
    cargarEventos(new Date(ahora - (PERIODOS[periodo].dias + DIAS_PREVIOS) * DIA_MS).toISOString()),
  ]);
  return calcularReporte(
    pedidos.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      cliente: p.cliente_empresa || p.cliente_nombre,
      items: p.pedido_items,
      bloques: p.bloques,
    })),
    eventos,
    desde,
    new Date(ahora).toISOString(),
  );
}
