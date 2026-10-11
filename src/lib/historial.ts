// Trazabilidad: qué llegó, qué se empezó y qué salió de cada área, y la línea de tiempo de cada pedido.
import "server-only";
import { connection } from "next/server";
import { AREAS, type AreaId } from "./catalogo";
import { describirItem, fechaEnPeru, leerTodo, type BloqueFila, type PedidoFila } from "./planta";

function prendasDe(p: PedidoFila): number {
  return p.pedido_items.reduce((n, i) => n + i.cantidad, 0);
}

function tituloDeBloque(p: PedidoFila, b: BloqueFila): string {
  const item = p.pedido_items.find((i) => i.id === b.item_id);
  return item ? describirItem({ ...item, cantidad: b.cantidad }) : `${b.cantidad} prendas`;
}

// ---------- Historial de un área ----------

export type Movimiento = {
  cuando: string;
  que: "Llegó" | "Empezó" | "Terminó" | "Problema" | "Resuelto";
  pedido: string;
  cliente: string;
  titulo: string;
  cantidad: number;
  detalle: string | null;
};

export type ResumenDia = { fecha: string; llegaron: number; terminaron: number };

const QUE = { empezar: "Empezó", terminar: "Terminó", problema: "Problema", resuelto: "Resuelto" } as const;

export async function cargarHistorialArea(area: AreaId): Promise<{ movimientos: Movimiento[]; dias: ResumenDia[] }> {
  await connection();
  const { pedidos: todos, eventos } = await leerTodo();
  const pedidos = todos.filter((p) => p.estado !== "cancelado");
  const porId = new Map(pedidos.map((p) => [p.id, p]));

  const movimientos: Movimiento[] = [];
  for (const e of eventos) {
    const p = porId.get(e.pedido_id);
    if (!p) continue;
    const b = e.bloque_id ? p.bloques.find((x) => x.id === e.bloque_id) : undefined;
    const base = { cuando: e.creado_en, pedido: p.codigo, cliente: p.cliente_empresa || p.cliente_nombre };

    if (e.area === area) {
      movimientos.push({
        ...base,
        que: QUE[e.tipo],
        titulo: b ? `${tituloDeBloque(p, b)} · bloque ${b.numero}` : p.pedido_items.map(describirItem).join(" · "),
        cantidad: b ? b.cantidad : prendasDe(p),
        detalle: e.detalle,
      });
    }

    // Lo que llega a un área es lo que sale de la anterior.
    if (area === "almacen" && e.area === "ventas" && e.tipo === "empezar") {
      movimientos.push({
        ...base,
        que: "Llegó",
        titulo: p.pedido_items.map(describirItem).join(" · "),
        cantidad: prendasDe(p),
        detalle: p.hay_tela ? "Pedido nuevo" : "Pedido nuevo: hay que comprar tela",
      });
    } else if (e.tipo === "terminar" && b && b.ruta[b.ruta.indexOf(e.area as AreaId) + 1] === area) {
      movimientos.push({
        ...base,
        que: "Llegó",
        titulo: `${tituloDeBloque(p, b)} · bloque ${b.numero}`,
        cantidad: b.cantidad,
        detalle: `Desde ${AREAS[e.area as AreaId].nombre}`,
      });
    } else if (e.tipo === "terminar" && !b && e.area === "almacen") {
      for (const x of p.bloques.filter((x) => x.ruta[0] === area)) {
        movimientos.push({
          ...base,
          que: "Llegó",
          titulo: `${tituloDeBloque(p, x)} · bloque ${x.numero}`,
          cantidad: x.cantidad,
          detalle: "Desde Almacén",
        });
      }
    }
  }
  movimientos.sort((a, b) => b.cuando.localeCompare(a.cuando));

  const porDia = new Map<string, ResumenDia>();
  for (const m of movimientos) {
    if (m.que !== "Llegó" && m.que !== "Terminó") continue;
    const fecha = fechaEnPeru(m.cuando);
    const dia = porDia.get(fecha) ?? { fecha, llegaron: 0, terminaron: 0 };
    if (m.que === "Llegó") dia.llegaron += m.cantidad;
    else dia.terminaron += m.cantidad;
    porDia.set(fecha, dia);
  }
  const dias = [...porDia.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);

  return { movimientos: movimientos.slice(0, 150), dias };
}

// ---------- Línea de tiempo de un pedido ----------

export type Traza = {
  pedido: PedidoFila;
  prendas: number;
  resumen: string;
  bloques: { numero: number; titulo: string; donde: string; estado: string }[];
  pasos: { cuando: string; area: string; que: string; detalle: string }[];
};

const ESTADO_BLOQUE = { en_cola: "En cola", en_proceso: "En proceso", detenido: "Detenido", terminado: "Terminado" };

export async function cargarTraza(codigo: string): Promise<Traza | null> {
  await connection();
  const { pedidos, eventos: todos } = await leerTodo();
  const p = pedidos.find((x) => x.codigo === codigo.toUpperCase());
  if (!p) return null;
  const eventos = todos.filter((e) => e.pedido_id === p.id);

  const QUE_VENTAS = {
    empezar: "Pedido registrado",
    terminar: "Entregado al cliente",
    problema: "Cambio de prioridad",
    resuelto: "Fecha reprogramada",
  };
  const pasos = eventos
    .map((e) => {
      const b = e.bloque_id ? p.bloques.find((x) => x.id === e.bloque_id) : undefined;
      return {
        cuando: e.creado_en,
        area: e.area === "ventas" ? "Ventas" : AREAS[e.area as AreaId].nombre,
        que: e.area === "ventas" ? QUE_VENTAS[e.tipo] : QUE[e.tipo],
        detalle: [b ? `Bloque ${b.numero} (${b.cantidad} prendas)` : e.area === "ventas" ? "" : "Pedido completo", e.detalle]
          .filter(Boolean)
          .join(" · "),
      };
    })
    .reverse();

  return {
    pedido: p,
    prendas: prendasDe(p),
    resumen: p.pedido_items.map(describirItem).join(" · "),
    bloques: p.bloques.map((b) => ({
      numero: b.numero,
      titulo: tituloDeBloque(p, b),
      donde:
        b.estado === "terminado"
          ? "Salió de planta"
          : p.almacen_estado !== "terminado"
            ? "Almacén"
            : AREAS[b.ruta[b.paso]].nombre,
      estado: p.almacen_estado !== "terminado" && b.estado !== "terminado" ? "Esperando tela" : ESTADO_BLOQUE[b.estado],
    })),
    pasos,
  };
}

// ---------- Pedidos entregados ----------

export type Entregado = {
  codigo: string;
  cliente: string;
  resumen: string;
  prendas: number;
  registrado: string;
  prometido: string | null;
  entregado: string | null;
  aTiempo: boolean | null;
};

export async function cargarEntregados(): Promise<Entregado[]> {
  await connection();
  const { pedidos: todos, eventos } = await leerTodo();
  const pedidos = todos.filter((p) => p.estado === "entregado");
  const entrega = new Map<number, string>();
  for (const e of eventos) {
    if (e.area === "ventas" && e.tipo === "terminar" && !entrega.has(e.pedido_id)) {
      entrega.set(e.pedido_id, fechaEnPeru(e.creado_en));
    }
  }
  return pedidos
    .map((p) => {
      const entregado = entrega.get(p.id) ?? null;
      return {
        codigo: p.codigo,
        cliente: p.cliente_empresa || p.cliente_nombre,
        resumen: p.pedido_items.map(describirItem).join(" · "),
        prendas: prendasDe(p),
        registrado: fechaEnPeru(p.creado_en),
        prometido: p.fecha_prometida,
        entregado,
        aTiempo: entregado && p.fecha_prometida ? entregado <= p.fecha_prometida : null,
      };
    })
    .reverse();
}
