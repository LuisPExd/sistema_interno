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
  hay_tela: boolean;
  /** Ya salió de la planta: está listo o entregado. */
  terminado: boolean;
  items: { id: number; producto: string; cantidad: number }[];
  bloques: {
    id: number;
    item_id: number;
    numero: number;
    cantidad: number;
    familia: keyof typeof FAMILIAS;
    ruta: AreaId[];
    /** Ya recorrió toda su ruta. */
    terminado?: boolean;
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
  /**
   * Lo que el área le dedicó más lo que estuvo detenido. Si el área tenía varios bloques en
   * proceso a la vez, el tiempo se reparte entre ellos.
   */
  horasReales: number | null;
  /** De EMPEZAR a TERMINADO sin repartir. */
  horasReloj: number | null;
  horasDetenido: number;
  /** En Almacén incluye la espera por la compra de tela. */
  horasPlan: number;
  /** Parte de lo planificado que es esperar la compra de tela: no ocupa al área. */
  horasCompra: number;
  /** Todavía no termina: `fin` es el momento del reporte y las horas son las que lleva. */
  enCurso: boolean;
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

/** Un pedido que la planta dejó listo en el periodo. Las fechas son de Perú. */
export type Entrega = {
  pedido: string;
  cliente: string;
  /** Primera fecha que se le prometió al cliente: reprogramar no la cambia. */
  prometido: string | null;
  reprogramado: boolean;
  /** Qué lleva el pedido: "130 Polo camisero · 50 Pantalón industrial". */
  detalle: string;
  /** Cuándo salió de la planta su último bloque. */
  listo: string;
  /** Cuándo lo recibió el cliente; null si todavía no. */
  entregado: string | null;
  /** Quedó listo en la fecha prometida original o antes. */
  aTiempo: boolean | null;
};

export type ResumenArea = {
  area: AreaId;
  nombre: string;
  /** Bloques que terminó el área en el periodo. */
  tramos: number;
  prendas: number;
  /**
   * Bloques de los que salen los tiempos: los terminados con hora de inicio y de fin, más los que
   * siguen en proceso y ya se pasaron de lo planificado (cuentan con las horas que llevan).
   */
  medidos: number;
  /** Horas reales sobre planificadas, menos 1: 0,25 es un 25 % por encima. null sin bloques medidos. */
  desviacion: number | null;
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
  /** Horas de trabajo del periodo en que el área tuvo algo detenido; dos bloques a la vez no suman doble. */
  horasDetenida: number;
};

/** Un tramo del eje de tiempo: un día, una semana o un mes según lo largo del periodo. */
export type Cubeta = { clave: string; etiqueta: string; diasHabiles: number; /** Último día que abarca. */ hasta: string };

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
  /** Lo que la planta puede terminar por día con la mezcla de prendas del periodo, y el área que lo limita. */
  capacidadPlanta: { prendasDia: number; limita: AreaId } | null;
  /** Días de trabajo que tuvo el periodo; de hoy cuenta solo lo transcurrido. */
  diasTrabajados: number;
  /** Prendas de los pedidos que se aceptaron en cada cubeta. */
  aceptadas: number[];
  /** Prendas aceptadas que todavía no habían salido de la planta al cierre de cada cubeta. */
  pendiente: number[];
  /** Lo mismo, justo antes de empezar el periodo. */
  pendienteInicial: number;
  /**
   * Lo que se aceptó en el periodo: prendas y días de trabajo que le pide al área que más carga
   * recibe. Si esos días superan los trabajados, se aceptó más de lo que la planta puede producir.
   */
  demanda: { prendas: number; pedidos: number; diasNecesarios: number; limita: AreaId } | null;
  /** Por semana (o por mes en periodos largos): pedidos y entregas son muy pocos para verlos por día. */
  porSemana: {
    unidad: "semana" | "mes";
    etiquetas: string[];
    diasHabiles: number[];
    /** Prendas de los pedidos aceptados y prendas que salieron de la planta. */
    aceptadas: number[];
    terminadas: number[];
    /** Pedidos que quedaron listos. */
    aTiempo: number[];
    tarde: number[];
  };
  /** Prendas aceptadas y terminadas en el periodo por tipo de prenda, de más a menos. */
  porPrenda: { prenda: string; aceptadas: number; terminadas: number }[];
  /** Lo que está en proceso al momento del reporte, con las horas que lleva. */
  enCurso: Tramo[];
  /** "2026-10", en orden. */
  meses: string[];
  problemasPorMes: Record<AreaId, number[]>;
  motivos: { motivo: string; veces: number }[];
  problemasPorMotivo: Record<AreaId, number[]>;
  /** Área que más se pasó de lo planificado en proporción; a igualdad, la de más problemas. */
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

/** Horas de trabajo entre dos instantes, sin el tope de días de horasHabilesEntre. */
function horasDeTrabajo(desde: string, hasta: string): number {
  const TRAMO = 60 * 24 * 3600000;
  const fin = new Date(hasta).getTime();
  let horas = 0;
  for (let a = new Date(desde).getTime(); a < fin; a += TRAMO) {
    horas += horasHabilesEntre(new Date(a), new Date(Math.min(fin, a + TRAMO)));
  }
  return horas;
}

// Apunte que deja ventas al reprogramar: "Fecha prometida: de 2026-10-07 a 2026-10-12".
const REPROGRAMACION = /^Fecha prometida: de (\S+) a /;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

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
    if (ultima?.clave === clave) {
      ultima.diasHabiles++;
      ultima.hasta = fecha;
    } else {
      const etiqueta = unidad === "mes" ? `${MESES[Number(clave.slice(5)) - 1]} ${clave.slice(2, 4)}` : diaMes(clave);
      cubetas.push({ clave, etiqueta, diasHabiles: 1, hasta: fecha });
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
  // Reparto del tiempo: por área, qué se está trabajando y qué tiene un problema abierto.
  const enProceso = new Map<AreaId, Set<string>>(ORDEN_AREAS.map((a) => [a, new Set<string>()]));
  const parados = new Map<AreaId, Set<string>>(ORDEN_AREAS.map((a) => [a, new Set<string>()]));
  const pausados = new Set<string>();
  const trabajado = new Map<string, number>();
  const reloj = new Map<AreaId, string>();
  const paro = new Map<AreaId, number>();
  // Por pedido: promesa original, recojo del cliente y salida del último bloque.
  const originales = new Map<number, string>();
  const reprogramados = new Set<number>();
  const recojos = new Map<number, string>();
  const salidas = new Map<number, string>();
  /** Día en que cada bloque salió de la planta. */
  const finDeBloque = new Map<number, string>();
  // Días que cada área necesita para la mezcla de prendas que la planta terminó en el periodo.
  const cargaMezcla = new Map<AreaId, number>();
  let prendasMezcla = 0;
  const prendas = new Map<string, { aceptadas: number; terminadas: number }>();
  const prendaDe = (nombre: string) => {
    if (!prendas.has(nombre)) prendas.set(nombre, { aceptadas: 0, terminadas: 0 });
    return prendas.get(nombre)!;
  };
  const nombreDe = (producto: string) => buscarProducto(producto)?.nombre ?? producto;
  // Lo que empezó y todavía no termina, por "área|bloque".
  const sinTerminar = new Map<string, { p: PedidoReporte; b: PedidoReporte["bloques"][number] | null; area: AreaId }>();

  /** Qué es y cuánto debía tomar un bloque (o un pedido, en Almacén) en un área. */
  const planDe = (p: PedidoReporte, b: PedidoReporte["bloques"][number] | null, area: AreaId) => {
    const cantidad = b ? b.cantidad : sumar(p.items, (i) => i.cantidad);
    const item = b ? p.items.find((i) => i.id === b.item_id) : undefined;
    const dias = b
      ? (cantidad * minutosPorPrenda(b.familia, area)) / AREAS[area].minutosPorDia
      : Math.max(ALMACEN.minimoDias, cantidad / ALMACEN.prendasPorDia);
    // La compra de tela retrasa al pedido pero no ocupa a Almacén, igual que en el simulador.
    const diasCompra = b || p.hay_tela ? 0 : ALMACEN.diasCompraSinTela;
    return {
      prenda: b ? (item ? nombreDe(item.producto) : FAMILIAS[b.familia].nombre) : "Tela e insumos del pedido",
      cantidad,
      horasPlan: redondear((dias + diasCompra) * HORAS_POR_DIA),
      horasCompra: diasCompra * HORAS_POR_DIA,
    };
  };

  /** Lleva el reloj del área hasta `instante`: reparte ese rato entre lo que tenía en proceso. */
  const avanzar = (area: AreaId, instante: string) => {
    const antes = reloj.get(area);
    reloj.set(area, instante);
    if (!antes || instante <= antes) return;
    const activos = enProceso.get(area)!;
    if (activos.size) {
      const parte = horasEntre(antes, instante) / activos.size;
      for (const c of activos) trabajado.set(c, (trabajado.get(c) ?? 0) + parte);
    }
    if (parados.get(area)!.size && instante > desde) {
      paro.set(area, (paro.get(area) ?? 0) + horasEntre(antes < desde ? desde : antes, instante));
    }
  };

  for (const e of ordenados) {
    const p = porId.get(e.pedido_id);
    if (!p) continue;

    if (e.area === "ventas") {
      // Ventas anota el registro (empezar), la entrega (terminar) y las reprogramaciones; lo demás son apuntes de prioridad.
      if (e.tipo === "empezar") llegadas.set(`almacen|p${p.id}`, e.creado_en);
      else if (e.tipo === "terminar") recojos.set(p.id, diaDe(e.creado_en));
      else if (e.tipo === "resuelto") {
        const de = e.detalle?.match(REPROGRAMACION)?.[1];
        if (de) {
          reprogramados.add(p.id);
          // Vale la primera: es la fecha que se le dio al cliente al confirmar.
          if (!originales.has(p.id) && ES_FECHA.test(de)) originales.set(p.id, de);
        }
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
    avanzar(area, e.creado_en);

    if (e.tipo === "empezar") {
      inicios.set(clave, e.creado_en);
      detenido.set(clave, 0);
      trabajado.set(clave, 0);
      enProceso.get(area)!.add(clave);
      sinTerminar.set(clave, { p, b, area });
    } else if (e.tipo === "terminar") {
      sinTerminar.delete(clave);
      enProceso.get(area)!.delete(clave);
      parados.get(area)!.delete(clave);
      pausados.delete(clave);
      if (b && area === b.ruta[b.ruta.length - 1]) {
        salidas.set(p.id, e.creado_en);
        finDeBloque.set(b.id, diaDe(e.creado_en));
        if (enPeriodo(e.creado_en)) {
          const suItem = p.items.find((i) => i.id === b.item_id);
          prendaDe(suItem ? nombreDe(suItem.producto) : FAMILIAS[b.familia].nombre).terminadas += cantidad;
          prendasMezcla += cantidad;
          cargaMezcla.set("almacen", (cargaMezcla.get("almacen") ?? 0) + cantidad / ALMACEN.prendasPorDia);
          for (const a of b.ruta) {
            cargaMezcla.set(a, (cargaMezcla.get(a) ?? 0) + (cantidad * minutosPorPrenda(b.familia, a)) / AREAS[a].minutosPorDia);
          }
        }
      }
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
      const llegada = llegadas.get(clave) ?? (b ? null : p.creado_en);
      const medido = inicio !== undefined;
      tramos.push({
        ...base,
        ...planDe(p, b, area),
        llegada,
        inicio: inicio ?? null,
        fin: e.creado_en,
        horasEspera: llegada && medido ? redondear(horasEntre(llegada, inicio)) : null,
        horasReales: medido ? redondear((trabajado.get(clave) ?? 0) + (detenido.get(clave) ?? 0)) : null,
        horasReloj: medido ? redondear(horasEntre(inicio, e.creado_en)) : null,
        horasDetenido: medido ? redondear(detenido.get(clave) ?? 0) : 0,
        enCurso: false,
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
      parados.get(area)!.add(clave);
      if (enProceso.get(area)!.delete(clave)) pausados.add(clave);
      if (enPeriodo(e.creado_en)) problemas.push(problema);
    } else {
      const problema = abiertos.get(clave);
      abiertos.delete(clave);
      parados.get(area)!.delete(clave);
      if (pausados.delete(clave)) enProceso.get(area)!.add(clave);
      if (!problema) continue;
      const horas = horasEntre(problema.reportado, e.creado_en);
      problema.resuelto = e.creado_en;
      problema.horasDetenido = redondear(horas);
      detenido.set(clave, (detenido.get(clave) ?? 0) + horas);
    }
  }
  for (const problema of abiertos.values()) problema.horasDetenido = redondear(horasEntre(problema.reportado, hasta));
  for (const area of ORDEN_AREAS) avanzar(area, hasta);

  // Lo que sigue en proceso: si no se contara, un bloque atascado no aparecería hasta terminar.
  const enCurso: Tramo[] = [];
  for (const [clave, { p, b, area }] of sinTerminar) {
    if (p.terminado || b?.terminado) continue;
    const inicio = inicios.get(clave)!;
    const abierto = abiertos.get(clave);
    const parado = (detenido.get(clave) ?? 0) + (abierto ? horasEntre(abierto.reportado, hasta) : 0);
    const llegada = llegadas.get(clave) ?? (b ? null : p.creado_en);
    enCurso.push({
      pedido: p.codigo,
      cliente: p.cliente,
      bloque: b ? b.numero : null,
      area,
      ...planDe(p, b, area),
      llegada,
      inicio,
      fin: hasta,
      horasEspera: llegada ? redondear(horasEntre(llegada, inicio)) : null,
      horasReales: redondear((trabajado.get(clave) ?? 0) + parado),
      horasReloj: redondear(horasEntre(inicio, hasta)),
      horasDetenido: redondear(parado),
      enCurso: true,
    });
  }

  // Cumplimiento: cuándo quedó listo cada pedido frente a lo que se le prometió al cliente al confirmar.
  for (const p of pedidos) {
    const salida = salidas.get(p.id);
    if (!p.terminado || !salida || !enPeriodo(salida)) continue;
    const prometido = originales.get(p.id) ?? p.fecha_prometida;
    const listo = diaDe(salida);
    entregas.push({
      pedido: p.codigo,
      cliente: p.cliente,
      prometido,
      reprogramado: reprogramados.has(p.id),
      detalle: p.items.map((i) => `${i.cantidad} ${nombreDe(i.producto)}`).join(" · "),
      listo,
      entregado: recojos.get(p.id) ?? null,
      aTiempo: prometido ? listo <= prometido : null,
    });
  }
  entregas.sort((a, b) => a.listo.localeCompare(b.listo));

  const limite = [...cargaMezcla].sort((a, b) => b[1] - a[1])[0];
  const capacidadPlanta =
    limite && limite[1] > 0 ? { prendasDia: Math.round(prendasMezcla / limite[1]), limita: limite[0] } : null;
  const horasDisponibles = horasDeTrabajo(desde, hasta);

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
    const medidos = [
      ...suyos.filter((t) => t.horasReales !== null),
      ...enCurso.filter((t) => t.area === area && t.horasReales! > t.horasPlan),
    ];
    const reales = sumar(medidos, (t) => t.horasReales!);
    const planificadas = sumar(medidos, (t) => t.horasPlan);
    const conEspera = suyos.filter((t) => t.horasEspera !== null);
    // La capacidad y su uso salen de todo lo producido; los tiempos, solo de lo medido.
    const horasPlan = sumar(suyos, (t) => t.horasPlan - t.horasCompra);
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
      desviacion: planificadas > 0 ? reales / planificadas - 1 : null,
      horasReales: redondear(reales),
      horasPlan: redondear(planificadas),
      horasDeRetraso: redondear(sumar(medidos, (t) => Math.max(0, t.horasReales! - t.horasPlan))),
      retrasados: medidos.filter((t) => t.horasReales! > t.horasPlan * TOLERANCIA).length,
      esperaMedia: conEspera.length ? redondear(sumar(conEspera, (t) => t.horasEspera!) / conEspera.length) : 0,
      procesoMedio: medidos.length
        ? redondear(sumar(medidos, (t) => Math.max(0, t.horasReales! - t.horasDetenido)) / medidos.length)
        : 0,
      detenidoMedio: medidos.length ? redondear(sumar(medidos, (t) => t.horasDetenido) / medidos.length) : 0,
      capacidadDia: horasPlan > 0 ? Math.round((prendas / horasPlan) * HORAS_POR_DIA) : null,
      uso: horasDisponibles ? horasPlan / horasDisponibles : 0,
      problemas: susProblemas.length,
      horasDetenida: redondear(paro.get(area) ?? 0),
    };
  });

  const porMes = unidad === "mes";
  const grupoDe = (fecha: string) => (porMes ? fecha.slice(0, 7) : lunesDe(fecha));
  const grupos = [...new Set(cubetas.map((c) => grupoDe(c.hasta)))];
  const porSemana: Reporte["porSemana"] = {
    unidad: porMes ? "mes" : "semana",
    etiquetas: grupos.map((g) => (porMes ? `${MESES[Number(g.slice(5)) - 1]} ${g.slice(2, 4)}` : `sem. ${diaMes(g)}`)),
    diasHabiles: grupos.map((g) => sumar(cubetas.filter((c) => grupoDe(c.hasta) === g), (c) => c.diasHabiles)),
    aceptadas: grupos.map(() => 0),
    terminadas: grupos.map(() => 0),
    aTiempo: grupos.map(() => 0),
    tarde: grupos.map(() => 0),
  };
  const sumarA = (serie: number[], dia: string, n: number) => {
    const i = grupos.indexOf(grupoDe(dia));
    if (i >= 0) serie[i] += n;
  };
  for (const x of entregas) if (x.aTiempo !== null) sumarA(x.aTiempo ? porSemana.aTiempo : porSemana.tarde, x.listo, 1);
  for (const t of tramos) if (t.area === "acabados") sumarA(porSemana.terminadas, diaDe(t.fin), t.cantidad);

  // Lo aceptado frente a lo que la planta puede hacer.
  const aceptadas = cubetas.map(() => 0);
  const cargaAceptada = new Map<AreaId, number>();
  let prendasAceptadas = 0;
  let pedidosAceptados = 0;
  for (const p of pedidos) {
    if (!enPeriodo(p.creado_en)) continue;
    const suyas = sumar(p.items, (x) => x.cantidad);
    const i = indice(p.creado_en);
    if (i !== undefined) aceptadas[i] += suyas;
    sumarA(porSemana.aceptadas, diaDe(p.creado_en), suyas);
    for (const x of p.items) prendaDe(nombreDe(x.producto)).aceptadas += x.cantidad;
    prendasAceptadas += suyas;
    pedidosAceptados++;
    cargaAceptada.set("almacen", (cargaAceptada.get("almacen") ?? 0) + suyas / ALMACEN.prendasPorDia);
    for (const b of p.bloques) {
      for (const a of b.ruta) {
        cargaAceptada.set(a, (cargaAceptada.get(a) ?? 0) + (b.cantidad * minutosPorPrenda(b.familia, a)) / AREAS[a].minutosPorDia);
      }
    }
  }
  const masCargada = [...cargaAceptada].sort((a, b) => b[1] - a[1])[0];
  const demanda = masCargada
    ? { prendas: prendasAceptadas, pedidos: pedidosAceptados, diasNecesarios: redondear(masCargada[1]), limita: masCargada[0] }
    : null;

  /** Prendas aceptadas hasta `dia` (incluido, o sin incluirlo) que todavía no habían salido de la planta. */
  const pendienteAl = (dia: string, incluido: boolean) => {
    const antes = (x: string) => (incluido ? x <= dia : x < dia);
    return sumar(pedidos, (p) =>
      antes(diaDe(p.creado_en))
        ? sumar(p.bloques, (b) => {
            // Sin movimiento a la vista, lo terminado salió antes de lo que se leyó.
            const fin = finDeBloque.get(b.id) ?? (b.terminado || p.terminado ? "" : null);
            return fin !== null && antes(fin) ? 0 : b.cantidad;
          })
        : 0,
    );
  };
  const pendiente = cubetas.map((c) => pendienteAl(c.hasta, true));
  const pendienteInicial = pendienteAl(diaDe(desde), false);

  // En proporción y no en horas: si no, siempre saldría el área que más horas mueve.
  const peor = [...areas].sort((a, b) => (b.desviacion ?? -1) - (a.desviacion ?? -1) || b.problemas - a.problemas)[0];
  const critica = (peor.desviacion ?? 0) > 0 ? peor : null;

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
    capacidadPlanta,
    diasTrabajados: redondear(horasDisponibles / HORAS_POR_DIA),
    aceptadas,
    pendiente,
    pendienteInicial,
    demanda,
    porSemana,
    porPrenda: [...prendas]
      .map(([prenda, v]) => ({ prenda, ...v }))
      .sort((a, b) => b.aceptadas + b.terminadas - (a.aceptadas + a.terminadas)),
    enCurso,
    meses,
    problemasPorMes,
    motivos,
    problemasPorMotivo,
    critica,
  };
}
