// Análisis de producción: un solo cálculo para la pantalla de análisis, el dashboard y el Excel.
// Es puro: recibe pedidos y eventos ya leídos (la lectura de la base está en reportes-datos.ts).
import { HORAS_POR_DIA, esHabil, horasHabilesEntre } from "./calendario";
import { ALMACEN, AREAS, FAMILIAS, ORDEN_AREAS, buscarProducto, minutosPorPrenda, type AreaId } from "./catalogo";

export type PedidoReporte = {
  id: number;
  codigo: string;
  cliente: string;
  creado_en: string;
  fecha_prometida: string | null;
  items: { id: number; producto: string; cantidad: number }[];
  bloques: {
    id: number;
    item_id: number;
    numero: number;
    cantidad: number;
    familia: keyof typeof FAMILIAS;
    ruta: AreaId[];
  }[];
};

export type EventoReporte = {
  pedido_id: number;
  bloque_id: number | null;
  /** Un área de planta, o "ventas" para el registro y la entrega del pedido. */
  area: string;
  tipo: "empezar" | "terminar" | "problema" | "resuelto";
  detalle: string | null;
  creado_en: string;
};

/** Un bloque (o un pedido, en Almacén) que pasó completo por un área. Todas las horas son de trabajo. */
export type Tramo = {
  pedido: string;
  cliente: string;
  bloque: number | null;
  area: AreaId;
  prenda: string;
  cantidad: number;
  /** Cuándo quedó disponible para el área; null si no se sabe. */
  llegada: string | null;
  /** null si no quedó registrado cuándo empezó: cuenta como producción, pero no se le puede medir el tiempo. */
  inicio: string | null;
  fin: string;
  horasEspera: number | null;
  /** De EMPEZAR a TERMINADO, incluido lo que estuvo detenido. */
  horasReales: number | null;
  horasDetenido: number;
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
  /** Si sigue abierto, hasta el momento del reporte. */
  horasDetenido: number;
};

export type Entrega = {
  pedido: string;
  cliente: string;
  prometido: string | null;
  /** Fecha de Perú. */
  entregado: string;
  aTiempo: boolean | null;
};

export type ResumenArea = {
  area: AreaId;
  nombre: string;
  /** Bloques que terminó el área en el periodo. */
  tramos: number;
  prendas: number;
  /** Bloques con hora de inicio y de fin: solo de estos salen los tiempos. */
  medidos: number;
  horasReales: number;
  /** Horas planificadas de los bloques medidos, para compararlas con las reales. */
  horasPlan: number;
  /** Horas de más sobre lo planificado, sumando solo los tramos que se pasaron. */
  horasDeRetraso: number;
  /** Tramos que tomaron más de 1,2 veces lo planificado. */
  retrasados: number;
  /** Promedios por bloque. */
  esperaMedia: number;
  procesoMedio: number;
  detenidoMedio: number;
  /** Prendas por día que el área puede sacar con la mezcla de prendas del periodo; null sin producción. */
  capacidadDia: number | null;
  /** Parte de la capacidad del periodo que se usó, de 0 a 1. */
  uso: number;
  problemas: number;
  horasDetenida: number;
};

/** Un tramo del eje de tiempo: un día, una semana o un mes según lo largo del periodo. */
export type Cubeta = { clave: string; etiqueta: string; diasHabiles: number };

export type Reporte = {
  desde: string;
  hasta: string;
  diasHabiles: number;
  tramos: Tramo[];
  problemas: Problema[];
  entregas: Entrega[];
  areas: ResumenArea[];
  unidad: "día" | "semana" | "mes";
  cubetas: Cubeta[];
  /** Prendas terminadas por área en cada cubeta. Lo que sale de Acabados es lo que produce la planta. */
  produccion: Record<AreaId, number[]>;
  entregasPorCubeta: { aTiempo: number; tarde: number }[];
  /** "2026-10", en orden. */
  meses: string[];
  problemasPorMes: Record<AreaId, number[]>;
  motivos: { motivo: string; veces: number }[];
  problemasPorMotivo: Record<AreaId, number[]>;
  /** Área que más horas acumuló sobre lo planificado; a igualdad, la de más problemas. */
  critica: ResumenArea | null;
};

const TOLERANCIA = 1.2;
const DESFASE_PERU = 5 * 3600000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

function esArea(x: string): x is AreaId {
  return ORDEN_AREAS.includes(x as AreaId);
}

/** Fecha de Perú de un instante: "2026-10-10". */
export function diaDe(instante: string): string {
  return new Date(new Date(instante).getTime() - DESFASE_PERU).toISOString().slice(0, 10);
}

const redondear = (n: number) => Math.round(n * 10) / 10;
const horasEntre = (a: string, b: string) => horasHabilesEntre(new Date(a), new Date(b));
const sumar = <T>(lista: T[], valor: (x: T) => number) => lista.reduce((n, x) => n + valor(x), 0);

function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const diaMes = (fecha: string) => `${Number(fecha.slice(8))} ${MESES[Number(fecha.slice(5, 7)) - 1]}`;

/** Parte el periodo en días, semanas o meses para que la gráfica nunca tenga demasiadas columnas. */
function armarCubetas(desde: string, hasta: string) {
  const dias: string[] = [];
  const d = new Date(`${diaDe(desde)}T00:00:00Z`);
  for (const fin = diaDe(hasta); dias.length < 800; d.setUTCDate(d.getUTCDate() + 1)) {
    const fecha = d.toISOString().slice(0, 10);
    if (fecha > fin) break;
    if (esHabil(fecha)) dias.push(fecha);
  }
  const unidad: Reporte["unidad"] = dias.length <= 31 ? "día" : dias.length <= 110 ? "semana" : "mes";
  const claveDe = (fecha: string) => (unidad === "día" ? fecha : unidad === "semana" ? lunesDe(fecha) : fecha.slice(0, 7));
  const cubetas: Cubeta[] = [];
  for (const fecha of dias) {
    const clave = claveDe(fecha);
    const ultima = cubetas[cubetas.length - 1];
    if (ultima?.clave === clave) ultima.diasHabiles++;
    else {
      const etiqueta = unidad === "mes" ? `${MESES[Number(clave.slice(5)) - 1]} ${clave.slice(2, 4)}` : diaMes(clave);
      cubetas.push({ clave, etiqueta, diasHabiles: 1 });
    }
  }
  const posicion = new Map(cubetas.map((c, i) => [c.clave, i]));
  return { unidad, cubetas, diasHabiles: dias.length, indice: (instante: string) => posicion.get(claveDe(diaDe(instante))) };
}

/**
 * `eventos` puede traer movimientos anteriores a `desde`: sirven para saber cuándo llegó y
 * cuándo empezó lo que terminó dentro del periodo.
 */
export function calcularReporte(
  pedidos: PedidoReporte[],
  eventos: EventoReporte[],
  desde: string,
  hasta: string,
): Reporte {
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const ordenados = [...eventos].sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  const enPeriodo = (instante: string) => instante >= desde && instante <= hasta;
  const { unidad, cubetas, diasHabiles, indice } = armarCubetas(desde, hasta);

  const tramos: Tramo[] = [];
  const problemas: Problema[] = [];
  const entregas: Entrega[] = [];
  // Por "área|bloque": cuándo llegó, cuándo empezó, cuánto lleva detenido y el problema abierto.
  const llegadas = new Map<string, string>();
  const inicios = new Map<string, string>();
  const detenido = new Map<string, number>();
  const abiertos = new Map<string, Problema>();

  for (const e of ordenados) {
    const p = porId.get(e.pedido_id);
    if (!p) continue;

    if (e.area === "ventas") {
      // Ventas anota el registro (empezar) y la entrega (terminar); lo demás son apuntes de prioridad.
      if (e.tipo === "empezar") llegadas.set(`almacen|p${p.id}`, e.creado_en);
      else if (e.tipo === "terminar" && enPeriodo(e.creado_en)) {
        const entregado = diaDe(e.creado_en);
        entregas.push({
          pedido: p.codigo,
          cliente: p.cliente,
          prometido: p.fecha_prometida,
          entregado,
          aTiempo: p.fecha_prometida ? entregado <= p.fecha_prometida : null,
        });
      }
      continue;
    }
    if (!esArea(e.area)) continue;
    const area = e.area;
    const b = e.bloque_id === null ? null : p.bloques.find((x) => x.id === e.bloque_id);
    if (b === undefined) continue;
    const clave = `${area}|${b ? `b${b.id}` : `p${p.id}`}`;
    const cantidad = b ? b.cantidad : sumar(p.items, (i) => i.cantidad);
    const base = { pedido: p.codigo, cliente: p.cliente, bloque: b ? b.numero : null, area };

    if (e.tipo === "empezar") {
      inicios.set(clave, e.creado_en);
      detenido.set(clave, 0);
    } else if (e.tipo === "terminar") {
      // Lo que termina aquí queda disponible para el área siguiente de su ruta.
      if (b) {
        const siguiente = b.ruta[b.ruta.indexOf(area) + 1];
        if (siguiente) llegadas.set(`${siguiente}|b${b.id}`, e.creado_en);
      } else {
        for (const x of p.bloques) if (x.ruta[0]) llegadas.set(`${x.ruta[0]}|b${x.id}`, e.creado_en);
      }
      const inicio = inicios.get(clave);
      inicios.delete(clave);
      if (!enPeriodo(e.creado_en)) continue;
      const item = b ? p.items.find((i) => i.id === b.item_id) : undefined;
      const dias = b
        ? (cantidad * minutosPorPrenda(b.familia, area)) / AREAS[area].minutosPorDia
        : Math.max(ALMACEN.minimoDias, cantidad / ALMACEN.prendasPorDia);
      const llegada = llegadas.get(clave) ?? (b ? null : p.creado_en);
      const medido = inicio !== undefined;
      tramos.push({
        ...base,
        prenda: b
          ? ((item && buscarProducto(item.producto)?.nombre) ?? FAMILIAS[b.familia].nombre)
          : "Tela e insumos del pedido",
        cantidad,
        llegada,
        inicio: inicio ?? null,
        fin: e.creado_en,
        horasEspera: llegada && medido ? redondear(horasEntre(llegada, inicio)) : null,
        horasReales: medido ? redondear(horasEntre(inicio, e.creado_en)) : null,
        horasDetenido: medido ? redondear(detenido.get(clave) ?? 0) : 0,
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
      const horas = horasEntre(problema.reportado, e.creado_en);
      problema.resuelto = e.creado_en;
      problema.horasDetenido = redondear(horas);
      detenido.set(clave, (detenido.get(clave) ?? 0) + horas);
    }
  }
  for (const problema of abiertos.values()) problema.horasDetenido = redondear(horasEntre(problema.reportado, hasta));

  const meses = [...new Set(cubetas.map((c) => c.clave.slice(0, 7)))];
  const cuenta = new Map<string, number>();
  for (const x of problemas) cuenta.set(x.motivo, (cuenta.get(x.motivo) ?? 0) + 1);
  const motivos = [...cuenta].map(([motivo, veces]) => ({ motivo, veces })).sort((a, b) => b.veces - a.veces);

  const produccion = {} as Reporte["produccion"];
  const problemasPorMes = {} as Reporte["problemasPorMes"];
  const problemasPorMotivo = {} as Reporte["problemasPorMotivo"];
  const areas: ResumenArea[] = ORDEN_AREAS.map((area) => {
    const suyos = tramos.filter((t) => t.area === area);
    const susProblemas = problemas.filter((x) => x.area === area);
    const medidos = suyos.filter((t) => t.horasReales !== null);
    const conEspera = suyos.filter((t) => t.horasEspera !== null);
    // La capacidad y su uso salen de todo lo producido; los tiempos, solo de lo medido.
    const horasPlan = sumar(suyos, (t) => t.horasPlan);
    const prendas = sumar(suyos, (t) => t.cantidad);

    produccion[area] = cubetas.map(() => 0);
    for (const t of suyos) {
      const i = indice(t.fin);
      if (i !== undefined) produccion[area][i] += t.cantidad;
    }
    problemasPorMes[area] = meses.map((m) => susProblemas.filter((x) => diaDe(x.reportado).startsWith(m)).length);
    problemasPorMotivo[area] = motivos.map((m) => susProblemas.filter((x) => x.motivo === m.motivo).length);

    return {
      area,
      nombre: AREAS[area].nombre,
      tramos: suyos.length,
      prendas,
      medidos: medidos.length,
      horasReales: redondear(sumar(medidos, (t) => t.horasReales!)),
      horasPlan: redondear(sumar(medidos, (t) => t.horasPlan)),
      horasDeRetraso: redondear(sumar(medidos, (t) => Math.max(0, t.horasReales! - t.horasPlan))),
      retrasados: medidos.filter((t) => t.horasReales! > t.horasPlan * TOLERANCIA).length,
      esperaMedia: conEspera.length ? redondear(sumar(conEspera, (t) => t.horasEspera!) / conEspera.length) : 0,
      procesoMedio: medidos.length
        ? redondear(sumar(medidos, (t) => Math.max(0, t.horasReales! - t.horasDetenido)) / medidos.length)
        : 0,
      detenidoMedio: medidos.length ? redondear(sumar(medidos, (t) => t.horasDetenido) / medidos.length) : 0,
      capacidadDia: horasPlan > 0 ? Math.round((prendas / horasPlan) * HORAS_POR_DIA) : null,
      uso: diasHabiles ? horasPlan / (diasHabiles * HORAS_POR_DIA) : 0,
      problemas: susProblemas.length,
      horasDetenida: redondear(sumar(susProblemas, (x) => x.horasDetenido)),
    };
  });

  const entregasPorCubeta = cubetas.map(() => ({ aTiempo: 0, tarde: 0 }));
  for (const x of entregas) {
    const i = indice(`${x.entregado}T12:00:00Z`);
    if (i !== undefined && x.aTiempo !== null) entregasPorCubeta[i][x.aTiempo ? "aTiempo" : "tarde"]++;
  }

  const peor = [...areas].sort((a, b) => b.horasDeRetraso - a.horasDeRetraso || b.problemas - a.problemas)[0];
  const critica = peor.horasDeRetraso > 0 || peor.problemas > 0 ? peor : null;

  return {
    desde,
    hasta,
    diasHabiles,
    tramos,
    problemas,
    entregas,
    areas,
    unidad,
    cubetas,
    produccion,
    entregasPorCubeta,
    meses,
    problemasPorMes,
    motivos,
    problemasPorMotivo,
    critica,
  };
}
