import "server-only";
import type { AreaId, FamiliaId } from "./catalogo";
import { db, dbConfigurada } from "./db";
import type { Trabajo } from "./simulador";

type FilaPedido = {
  id: number;
  codigo: string;
  urgente: boolean;
  hay_tela: boolean;
  fecha_prometida: string | null;
  almacen_estado: string;
  pedido_items: { cantidad: number }[];
  bloques: { cantidad: number; familia: string; ruta: string[]; paso: number; estado: string }[];
};

/** Pedidos que ocupan capacidad ahora mismo, en el formato del simulador. */
export async function cargarCola(): Promise<Trabajo[]> {
  // Sin base de datos se simula con la planta vacía.
  if (!dbConfigurada()) return [];

  const { data, error } = await db()
    .from("pedidos")
    .select(
      "id, codigo, urgente, hay_tela, fecha_prometida, almacen_estado, pedido_items (cantidad), bloques (cantidad, familia, ruta, paso, estado)",
    )
    .in("estado", ["confirmado", "en_produccion"]);
  if (error) throw new Error(error.message);

  return (data as FilaPedido[]).map((p) => ({
    id: p.codigo,
    urgente: p.urgente,
    fechaPrometida: p.fecha_prometida,
    almacen:
      p.almacen_estado === "terminado"
        ? null
        : { prendas: p.pedido_items.reduce((n, i) => n + i.cantidad, 0), hayTela: p.hay_tela },
    bloques: p.bloques
      .filter((b) => b.estado !== "terminado")
      .map((b) => ({
        familia: b.familia as FamiliaId,
        cantidad: b.cantidad,
        pendientes: b.ruta.slice(b.paso) as AreaId[],
        enProceso: b.estado === "en_proceso" || b.estado === "detenido",
      })),
  }));
}
