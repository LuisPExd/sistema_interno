// Reportes para el jefe de producción: retraso frente a lo planificado y problemas por área.
// Cálculo puro a partir de pedidos y eventos; la lectura de la base está en reportes-datos.ts.
import { HORAS_POR_DIA, horasHabilesEntre } from "./calendario";
import { ALMACEN, AREAS, FAMILIAS, ORDEN_AREAS, buscarProducto, minutosPorPrenda, type AreaId } from "./catalogo";

export type PedidoReporte = {
  id: number;
  codigo: string;
  cliente: string;
  items: { id: number; producto: string; cantidad: number }[];
  bloques: { id: number; item_id: number; numero: number; cantidad: number; familia: keyof typeof FAMILIAS }[];
};

export type EventoReporte = {
  pedido_id: number;
  bloque_id: number | null;
  area: string;
  tipo: "empezar" | "terminar" | "problema" | "resuelto";
  detalle: string | null;
  creado_en: string;
};

/** Un bloque (o un pedido, en Almacén) que pasó completo por un área. */
export type Tramo = {
  pedido: string;
  cliente: string;
  bloque: number | null;
  area: AreaId;
  prenda: string;
  cantidad: number;
  inicio: string;
  fin: string;
  horasReales: number;
  horasPlan: number;
};

export type Problema = {
  pedido: string;
  cliente: string;
  bloque: number | null;
  area: AreaId;
  motivo: string;
  detalle: string;
  reportado: string;
  resuelto: string | null;
  /** Horas de trabajo detenido; si sigue abierto, hasta el momento del reporte. */
  horasDetenido: number;
};

export type ResumenArea = {
  area: AreaId;
  nombre: string;
  tramos: number;
  horasReales: number;
  horasPlan: number;
  /** Horas de más sobre lo planificado, sumando solo los tramos que se pasaron. */
  horasDeRetraso: number;
  /** Tramos que tomaron más de 1,2 veces lo planificado. */
  retrasados: number;
  problemas: number;
  horasDetenida: number;
};

export type Reporte = {
  desde: string;
  hasta: string;
  tramos: Tramo[];
  problemas: Problema[];
  areas: ResumenArea[];
  /** "2026-10", en orden. */
  meses: string[];
  /** Problemas por área y mes, en el orden de `meses`. */
  problemasPorMes: Record<AreaId, number[]>;
  motivos: { motivo: string; veces: number }[];
  /** Área que más horas acumuló sobre lo planificado; null si ninguna se pasó. */
  critica: ResumenArea | null;
};

const TOLERANCIA = 1.2;

function esArea(x: string): x is AreaId {
  return ORDEN_AREAS.includes(x as AreaId);
}

/** Mes de Perú de un instante: "2026-10". */
function mesDe(instante: string): string {
  return new Date(new Date(instante).getTime() - 5 * 3600000).toISOString().slice(0, 7);
}

function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  const [a, m] = mesDe(desde).split("-").map(Number);
  for (let anio = a, mes = m; meses.length < 36; mes++) {
    if (mes > 12) {
      mes = 1;
      anio++;
    }
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    meses.push(clave);
    if (clave >= mesDe(hasta)) break;
  }
  return meses;
}

const redondear = (n: number) => Math.round(n * 10) / 10;

/** `eventos` puede traer movimientos anteriores a `desde`: sirven para saber cuándo empezó lo que terminó en el periodo. */
export function calcularReporte(
  pedidos: PedidoReporte[],
  eventos: EventoReporte[],
  desde: string,
  hasta: string,
): Reporte {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const ordenados = [...eventos].sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const enPeriodo = (instante: string) => instante >= desde && instante <= hasta;

  const tramos: Tramo[] = [];
  const problemas: Problema[] = [];
  const inicios = new Map<string, string>();
  const abiertos = new Map<string, Problema>();

  for (const e of ordenados) {
    const p = porId.get(e.pedido_id);
    if (!p || !esArea(e.area)) continue;
    const area = e.area;
    const b = e.bloque_id === null ? null : p.bloques.find((x) => x.id === e.bloque_id);
    if (b === undefined) continue;
    const clave = `${area}|${b ? `b${b.id}` : `p${p.id}`}`;
    const cantidad = b ? b.cantidad : p.items.reduce((n, i) => n + i.cantidad, 0);
    const item = b ? p.items.find((i) => i.id === b.item_id) : undefined;
    const prenda = b
      ? ((item && buscarProducto(item.producto)?.nombre) ?? FAMILIAS[b.familia].nombre)
      : "Tela e insumos del pedido";
    const base = { pedido: p.codigo, cliente: p.cliente, bloque: b ? b.numero : null, area };

    if (e.tipo === "empezar") {
      inicios.set(clave, e.creado_en);
    } else if (e.tipo === "terminar") {
      const inicio = inicios.get(clave);
      inicios.delete(clave);
      if (!inicio || !enPeriodo(e.creado_en)) continue;
      const dias = b
        ? (cantidad * minutosPorPrenda(b.familia, area)) / AREAS[area].minutosPorDia
        : Math.max(ALMACEN.minimoDias, cantidad / ALMACEN.prendasPorDia);
      tramos.push({
        ...base,
        prenda,
        cantidad,
        inicio,
        fin: e.creado_en,
        horasReales: redondear(horasHabilesEntre(new Date(inicio), new Date(e.creado_en))),
        horasPlan: redondear(dias * HORAS_POR_DIA),
      });
    } else if (e.tipo === "problema") {
      const texto = e.detalle?.trim() || "Sin detalle";
      const problema: Problema = {
        ...base,
        // "Otro problema: se fue la luz" cuenta como "Otro problema"; la descripción queda en detalle.
        motivo: texto.split(":")[0].trim(),
        detalle: texto,
        reportado: e.creado_en,
        resuelto: null,
        horasDetenido: 0,
      };
      abiertos.set(clave, problema);
      if (enPeriodo(e.creado_en)) problemas.push(problema);
    } else {
      const problema = abiertos.get(clave);
      abiertos.delete(clave);
      if (!problema) continue;
      problema.resuelto = e.creado_en;
      problema.horasDetenido = redondear(horasHabilesEntre(new Date(problema.reportado), new Date(e.creado_en)));
    }
  }
  for (const problema of abiertos.values()) {
    problema.horasDetenido = redondear(horasHabilesEntre(new Date(problema.reportado), new Date(hasta)));
  }

  const meses = mesesEntre(desde, hasta);
  const problemasPorMes = {} as Record<AreaId, number[]>;
  const areas: ResumenArea[] = ORDEN_AREAS.map((area) => {
    const suyos = tramos.filter((t) => t.area === area);
    const susProblemas = problemas.filter((x) => x.area === area);
    problemasPorMes[area] = meses.map((m) => susProblemas.filter((x) => mesDe(x.reportado) === m).length);
    return {
      area,
      nombre: AREAS[area].nombre,
      tramos: suyos.length,
      horasReales: redondear(suyos.reduce((n, t) => n + t.horasReales, 0)),
      horasPlan: redondear(suyos.reduce((n, t) => n + t.horasPlan, 0)),
      horasDeRetraso: redondear(suyos.reduce((n, t) => n + Math.max(0, t.horasReales - t.horasPlan), 0)),
      retrasados: suyos.filter((t) => t.horasReales > t.horasPlan * TOLERANCIA).length,
      problemas: susProblemas.length,
      horasDetenida: redondear(susProblemas.reduce((n, x) => n + x.horasDetenido, 0)),
    };
  });

  const cuenta = new Map<string, number>();
  for (const x of problemas) cuenta.set(x.motivo, (cuenta.get(x.motivo) ?? 0) + 1);
  const motivos = [...cuenta].map(([motivo, veces]) => ({ motivo, veces })).sort((a, b) => b.veces - a.veces);

  const peor = [...areas].sort((a, b) => b.horasDeRetraso - a.horasDeRetraso || b.problemas - a.problemas)[0];
  const critica = peor.horasDeRetraso > 0 || peor.problemas > 0 ? peor : null;

  return { desde, hasta, tramos, problemas, areas, meses, problemasPorMes, motivos, critica };
}
