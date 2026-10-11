// Lee el estado de la planta desde Supabase y lo deja listo para las pantallas.
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { HORAS_POR_DIA, diaHabil, horasHabilesEntre, hoyEnPeru } from "./calendario";
import {
  ALMACEN,
  AREAS,
  FAMILIAS,
  MARGEN,
  ORDEN_AREAS,
  buscarProducto,
  minutosPorPrenda,
  type AreaId,
  type FamiliaId,
  type Personalizacion,
} from "./catalogo";
import { usarConfiguracion } from "./configuracion";
import { BUCKET_DISENOS, db } from "./db";
import { fechaCorta } from "./formato";
import { modelosDe } from "./modelos";
import { estadoDeCola, type Trabajo } from "./simulador";

export type ItemFila = {
  id: number;
  producto: string;
  cantidad: number;
  personalizacion: Personalizacion;
  color: string | null;
  tallas: Record<string, number> | null;
  notas: string | null;
};

export type BloqueFila = {
  id: number;
  item_id: number;
  numero: number;
  cantidad: number;
  familia: FamiliaId;
  ruta: AreaId[];
  paso: number;
  estado: "en_cola" | "en_proceso" | "detenido" | "terminado";
  inicio_paso: string | null;
};

export type PedidoFila = {
  id: number;
  codigo: string;
  cliente_nombre: string;
  cliente_empresa: string | null;
  cliente_telefono: string | null;
  canal: "web" | "presencial";
  cotizacion_codigo: string | null;
  urgente: boolean;
  hay_tela: boolean;
  estado: "borrador" | "confirmado" | "en_produccion" | "listo" | "entregado" | "cancelado";
  almacen_estado: "en_cola" | "en_proceso" | "detenido" | "terminado";
  almacen_inicio: string | null;
  fecha_prometida: string | null;
  creado_en: string;
  pedido_items: ItemFila[];
  bloques: BloqueFila[];
};

export type EventoFila = {
  pedido_id: number;
  bloque_id: number | null;
  /** Un área de planta, o "ventas" para lo que registra ventas o el jefe de producción. */
  area: string;
  tipo: "empezar" | "terminar" | "problema" | "resuelto";
  detalle: string | null;
  creado_en: string;
};

const CAMPOS_PEDIDO =
  "id, codigo, cliente_nombre, cliente_empresa, cliente_telefono, canal, cotizacion_codigo, urgente, hay_tela, estado, almacen_estado, almacen_inicio, fecha_prometida, creado_en, " +
  "pedido_items (id, producto, cantidad, personalizacion, color, tallas, notas), " +
  "bloques (id, item_id, numero, cantidad, familia, ruta, paso, estado, inicio_paso)";

const EN_PLANTA: PedidoFila["estado"][] = ["confirmado", "en_produccion"];

export async function cargarPedidos(estados: PedidoFila["estado"][]): Promise<PedidoFila[]> {
  await usarConfiguracion();
  const { data, error } = await db()
    .from("pedidos")
    .select(CAMPOS_PEDIDO)
    .in("estado", estados)
    .order("id");
  if (error) throw new Error(error.message);
  const pedidos = data as unknown as PedidoFila[];
  for (const p of pedidos) p.bloques.sort((a, b) => a.numero - b.numero);
  return pedidos;
}

/** Pedidos que ocupan capacidad, en el formato del simulador. */
export function aTrabajos(pedidos: PedidoFila[]): Trabajo[] {
  return pedidos
    .filter((p) => EN_PLANTA.includes(p.estado))
    .map((p) => ({
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
          familia: b.familia,
          cantidad: b.cantidad,
          pendientes: b.ruta.slice(b.paso),
          enProceso: p.almacen_estado === "terminado" && b.estado !== "en_cola",
        })),
    }));
}

export async function cargarCola(): Promise<Trabajo[]> {
  return aTrabajos(await cargarPedidos(EN_PLANTA));
}

// ---------- Lectura compartida ----------

export const ETIQUETA_PLANTA = "planta";

export type Lectura = {
  pedidos: PedidoFila[];
  /** Del más reciente al más antiguo. */
  eventos: EventoFila[];
  /** Enlace temporal al diseño del cliente, por código de pedido. */
  disenos: Record<string, string>;
  /** Enlaces temporales a las imágenes del modelo (vistas de la web), por código de pedido. */
  modelos: Record<string, string[]>;
};

/**
 * Todo lo que las pantallas leen de la base de datos. Se guarda en memoria del servidor y se
 * comparte entre pantallas y tabletas: entrar a una página no vuelve a consultar Supabase.
 * Cada acción del sistema lo invalida con ETIQUETA_PLANTA; el plazo corto cubre los cambios
 * que llegan por fuera (el script de demo u otro servidor).
 */
export async function leerTodo(): Promise<Lectura> {
  "use cache";
  cacheTag(ETIQUETA_PLANTA);
  cacheLife({ revalidate: 20, expire: 120 });

  const [pedidos, eventosRes] = await Promise.all([
    cargarPedidos(["confirmado", "en_produccion", "listo", "entregado", "cancelado"]),
    db()
      .from("eventos")
      .select("pedido_id, bloque_id, area, tipo, detalle, creado_en")
      .order("creado_en", { ascending: false })
      .limit(2000),
  ]);
  if (eventosRes.error) throw new Error(eventosRes.error.message);

  const [disenos, modelos] = await Promise.all([firmarDisenos(pedidos), firmarModelos(pedidos)]);
  return { pedidos, eventos: eventosRes.data as EventoFila[], disenos, modelos };
}

async function firmarModelos(pedidos: PedidoFila[]): Promise<Record<string, string[]>> {
  const activos = pedidos.filter((p) => p.cotizacion_codigo && EN_PLANTA.includes(p.estado));
  if (activos.length === 0) return {};
  const porCotizacion = await modelosDe(activos.map((p) => p.cotizacion_codigo!));
  const modelos: Record<string, string[]> = {};
  for (const p of activos) {
    const urls = porCotizacion[p.cotizacion_codigo!];
    if (urls) modelos[p.codigo] = urls;
  }
  return modelos;
}

async function firmarDisenos(pedidos: PedidoFila[]): Promise<Record<string, string>> {
  const activos = pedidos.filter((p) => p.cotizacion_codigo && EN_PLANTA.includes(p.estado));
  if (activos.length === 0) return {};
  const { data, error } = await db()
    .from("cotizaciones")
    .select("codigo, diseno_archivo")
    .in(
      "codigo",
      activos.map((p) => p.cotizacion_codigo),
    )
    .not("diseno_archivo", "is", null);
  if (error) throw new Error(error.message);
  if (data.length === 0) return {};
  const { data: firmados } = await db()
    .storage.from(BUCKET_DISENOS)
    .createSignedUrls(
      data.map((c) => c.diseno_archivo as string),
      3600,
    );
  const urls: Record<string, string> = {};
  data.forEach((c, i) => {
    const url = firmados?.[i]?.signedUrl;
    const pedido = activos.find((x) => x.cotizacion_codigo === c.codigo);
    if (url && pedido) urls[pedido.codigo] = url;
  });
  return urls;
}

// ---------- Vista de pedidos ----------

export type Semaforo = "verde" | "amarillo" | "rojo";

export type PedidoVista = {
  id: number;
  codigo: string;
  cliente: string;
  telefono: string | null;
  canal: PedidoFila["canal"];
  urgente: boolean;
  estado: PedidoFila["estado"];
  resumen: string;
  prendas: number;
  avance: number;
  /** Áreas donde hay bloques del pedido ahora mismo. */
  areas: string[];
  fechaPrometida: string | null;
  /** Fecha en que terminaría producción según la carga actual. */
  fechaEstimada: string | null;
  margenDias: number | null;
  /** Fecha a la que se podría reprogramar con el cliente: fin estimado más el margen mínimo. */
  fechaSugerida: string | null;
  semaforo: Semaforo;
  detenido: boolean;
};

const NOMBRE_PERSONALIZACION: Record<Personalizacion, string> = {
  ninguna: "",
  bordado: "bordado",
  dtf: "con DTF",
  sublimado: "sublimado",
  bordado_dtf: "bordado + DTF",
};

export function describirItem(item: Pick<ItemFila, "producto" | "cantidad" | "personalizacion">): string {
  const nombre = buscarProducto(item.producto)?.nombre ?? item.producto;
  return `${item.cantidad} ${nombre} ${NOMBRE_PERSONALIZACION[item.personalizacion]}`.trim();
}

// Almacén no tiene minutos por prenda; se le da un peso fijo en el avance.
const PESO_ALMACEN = 0.05;

function avanceDe(p: PedidoFila): number {
  let hechos = 0;
  let total = 0;
  for (const b of p.bloques) {
    b.ruta.forEach((area, i) => {
      const minutos = b.cantidad * minutosPorPrenda(b.familia, area);
      total += minutos;
      if (i < b.paso) hechos += minutos;
    });
  }
  const almacen = p.almacen_estado === "terminado" ? PESO_ALMACEN : 0;
  return Math.round((almacen + (1 - PESO_ALMACEN) * (total > 0 ? hechos / total : 0)) * 100);
}

function areasDe(p: PedidoFila): string[] {
  if (p.almacen_estado !== "terminado") return [AREAS.almacen.nombre];
  const presentes = new Set(p.bloques.filter((b) => b.estado !== "terminado").map((b) => b.ruta[b.paso]));
  return ORDEN_AREAS.filter((a) => presentes.has(a)).map((a) => AREAS[a].nombre);
}

function aVista(p: PedidoFila, cola: ReturnType<typeof estadoDeCola>): PedidoVista {
  const estimado = cola.get(p.codigo);
  const detenido = p.almacen_estado === "detenido" || p.bloques.some((b) => b.estado === "detenido");
  const margen = estimado?.margen_dias ?? null;
  const terminado = p.estado === "listo" || p.estado === "entregado";
  const semaforo: Semaforo = terminado
    ? "verde"
    : detenido || (margen !== null && margen < 0)
      ? "rojo"
      : margen !== null && margen < 1
        ? "amarillo"
        : "verde";
  return {
    id: p.id,
    codigo: p.codigo,
    cliente: p.cliente_empresa || p.cliente_nombre,
    telefono: p.cliente_telefono,
    canal: p.canal,
    urgente: p.urgente,
    estado: p.estado,
    resumen: p.pedido_items.map(describirItem).join(" · "),
    prendas: p.pedido_items.reduce((n, i) => n + i.cantidad, 0),
    avance: terminado ? 100 : avanceDe(p),
    areas: terminado ? [] : areasDe(p),
    fechaPrometida: p.fecha_prometida,
    fechaEstimada: estimado?.fecha_fin ?? null,
    margenDias: margen,
    fechaSugerida: estimado ? diaHabil(estimado.fecha_fin, MARGEN.minimoDias) : null,
    semaforo,
    detenido,
  };
}

// ---------- Vista de área ----------

export type Tarjeta = {
  tipo: "pedido" | "bloque";
  id: number;
  pedidoId: number;
  pedido: string;
  cliente: string;
  urgente: boolean;
  titulo: string;
  detalle: string;
  cantidad: number;
  /** Tipos de prenda que lleva: uno en un bloque, varios en un pedido que está en Almacén. */
  prendas: { nombre: string; cantidad: number }[];
  estado: "en_cola" | "en_proceso" | "detenido";
  inicio: string | null;
  horasEsperadas: number;
  /** Horas de trabajo que lleva en proceso. */
  horasTranscurridas: number;
  /** Prendas de este tipo que el área saca por día. */
  capacidadDia: number;
  problema: string | null;
  fechaPrometida: string | null;
  disenoUrl: string | null;
  /** Imágenes del modelo que eligió el cliente; vacío si el pedido no vino con imágenes. */
  modelos: string[];
  aviso: string | null;
};

function horasEsperadas(area: AreaId, familia: FamiliaId, cantidad: number): number {
  return ((cantidad * minutosPorPrenda(familia, area)) / AREAS[area].minutosPorDia) * HORAS_POR_DIA;
}

function tarjetasDe(area: AreaId, pedidos: PedidoFila[], problemas: Map<string, string>): Tarjeta[] {
  const tarjetas: Tarjeta[] = [];
  for (const p of pedidos) {
    if (!EN_PLANTA.includes(p.estado)) continue;
    const base = {
      pedidoId: p.id,
      pedido: p.codigo,
      cliente: p.cliente_empresa || p.cliente_nombre,
      urgente: p.urgente,
      fechaPrometida: p.fecha_prometida,
      disenoUrl: null,
      modelos: [] as string[],
    };
    if (area === "almacen") {
      if (p.almacen_estado === "terminado") continue;
      const prendas = p.pedido_items.reduce((n, i) => n + i.cantidad, 0);
      tarjetas.push({
        ...base,
        tipo: "pedido",
        id: p.id,
        titulo: "Tela e insumos",
        detalle: p.pedido_items.map(describirItem).join(" · "),
        cantidad: prendas,
        prendas: p.pedido_items.map((i) => ({ nombre: buscarProducto(i.producto)?.nombre ?? i.producto, cantidad: i.cantidad })),
        estado: p.almacen_estado,
        inicio: p.almacen_inicio,
        horasEsperadas: Math.max(ALMACEN.minimoDias, prendas / ALMACEN.prendasPorDia) * HORAS_POR_DIA,
        horasTranscurridas: 0,
        capacidadDia: ALMACEN.prendasPorDia,
        problema: problemas.get(`pedido-${p.id}`) ?? null,
        aviso: p.hay_tela ? null : "Hay que comprar tela",
      });
      continue;
    }
    if (p.almacen_estado !== "terminado") continue;
    for (const b of p.bloques) {
      if (b.estado === "terminado" || b.ruta[b.paso] !== area) continue;
      const item = p.pedido_items.find((i) => i.id === b.item_id);
      const tallas =
        item?.tallas && p.bloques.filter((x) => x.item_id === b.item_id).length === 1
          ? Object.entries(item.tallas)
              .filter(([, n]) => n > 0)
              .map(([t, n]) => `${t}: ${n}`)
              .join("   ")
          : "";
      tarjetas.push({
        ...base,
        tipo: "bloque",
        id: b.id,
        titulo: item ? describirItem({ ...item, cantidad: b.cantidad }) : FAMILIAS[b.familia].nombre,
        detalle: [`Bloque ${b.numero} de ${p.bloques.length}`, item?.color, tallas, item?.notas]
          .filter(Boolean)
          .join(" · "),
        cantidad: b.cantidad,
        prendas: [{ nombre: (item && buscarProducto(item.producto)?.nombre) ?? FAMILIAS[b.familia].nombre, cantidad: b.cantidad }],
        estado: b.estado,
        inicio: b.inicio_paso,
        horasEsperadas: horasEsperadas(area, b.familia, b.cantidad),
        horasTranscurridas: 0,
        capacidadDia: Math.round(AREAS[area].minutosPorDia / minutosPorPrenda(b.familia, area)),
        problema: problemas.get(`bloque-${b.id}`) ?? null,
        aviso: null,
      });
    }
  }
  const rango = (t: Tarjeta) => (t.estado === "en_cola" ? 1 : 0);
  return tarjetas.sort(
    (a, b) =>
      rango(a) - rango(b) ||
      Number(b.urgente) - Number(a.urgente) ||
      (a.fechaPrometida ?? "9999").localeCompare(b.fechaPrometida ?? "9999") ||
      a.id - b.id,
  );
}

// ---------- Alertas y carga ----------

export type Alerta = {
  nivel: "rojo" | "amarillo" | "verde";
  titulo: string;
  texto: string;
  /** Qué se recomienda hacer. */
  accion: string;
};

export type CargaArea = {
  area: AreaId;
  nombre: string;
  enProceso: number;
  enCola: number;
  prendas: number;
  /** Días de trabajo que representa lo que tiene encima: en cuánto se libera. */
  dias: number;
  terminadasHoy: number;
  /** Horas de trabajo de lo que está en proceso ahora. */
  horasEnProceso: number;
  /** Ya tiene en proceso el trabajo de un día: no puede empezar otro bloque (HANDOFF B9). */
  llena: boolean;
};

const UMBRAL_ATASCO = 1.5;
const HORAS_SIN_REPORTE = 4;
const DIAS_CUELLO = 3;

export type Planta = {
  pedidos: PedidoVista[];
  tarjetas: Record<AreaId, Tarjeta[]>;
  carga: CargaArea[];
  alertas: Alerta[];
  urgentesActivos: number;
};

export async function cargarPlanta(): Promise<Planta> {
  // Todo lo de aquí depende del momento de la consulta.
  await connection();
  await usarConfiguracion();
  const ahora = new Date();
  const hoy = hoyEnPeru();

  const lectura = await leerTodo();
  const filas = lectura.pedidos.filter((p) => p.estado !== "entregado" && p.estado !== "cancelado");
  const { eventos } = lectura;

  // Último problema reportado de cada bloque (o pedido, en Almacén).
  const problemas = new Map<string, string>();
  const ultimoToque = new Map<string, Date>();
  const terminadasHoy = new Map<string, number>();
  const cantidadDe = new Map<number, number>();
  for (const p of filas) for (const b of p.bloques) cantidadDe.set(b.id, b.cantidad);
  for (const e of eventos) {
    const clave = e.bloque_id ? `bloque-${e.bloque_id}` : `pedido-${e.pedido_id}`;
    if (e.tipo === "problema" && !problemas.has(clave)) problemas.set(clave, e.detalle ?? "Problema");
    if (!ultimoToque.has(e.area)) ultimoToque.set(e.area, new Date(e.creado_en));
    if (e.tipo === "terminar" && e.bloque_id && fechaEnPeru(e.creado_en) === hoy) {
      terminadasHoy.set(e.area, (terminadasHoy.get(e.area) ?? 0) + (cantidadDe.get(e.bloque_id) ?? 0));
    }
  }

  const cola = estadoDeCola(aTrabajos(filas), hoy);
  const pedidos = filas.map((p) => aVista(p, cola));
  const tarjetas = Object.fromEntries(
    ORDEN_AREAS.map((a) => [a, tarjetasDe(a, filas, problemas)]),
  ) as Record<AreaId, Tarjeta[]>;
  for (const lista of Object.values(tarjetas)) {
    for (const t of lista) {
      if (t.inicio && t.estado !== "en_cola") t.horasTranscurridas = horasHabilesEntre(new Date(t.inicio), ahora);
    }
  }

  for (const lista of Object.values(tarjetas)) {
    for (const t of lista) {
      t.disenoUrl = lectura.disenos[t.pedido] ?? null;
      t.modelos = lectura.modelos[t.pedido] ?? [];
    }
  }

  const carga: CargaArea[] = ORDEN_AREAS.map((area) => {
    const lista = tarjetas[area];
    const horasEnProceso = lista.filter((t) => t.estado !== "en_cola").reduce((n, t) => n + t.horasEsperadas, 0);
    return {
      area,
      nombre: AREAS[area].nombre,
      enProceso: lista.filter((t) => t.estado !== "en_cola").length,
      enCola: lista.filter((t) => t.estado === "en_cola").length,
      prendas: lista.reduce((n, t) => n + t.cantidad, 0),
      dias: lista.reduce((n, t) => n + t.horasEsperadas, 0) / HORAS_POR_DIA,
      terminadasHoy: terminadasHoy.get(area) ?? 0,
      horasEnProceso,
      llena: horasEnProceso >= HORAS_POR_DIA - 1e-9,
    };
  });

  const alertas: Alerta[] = [];
  for (const area of ORDEN_AREAS) {
    const nombre = AREAS[area].nombre;
    const lista = tarjetas[area];
    // El área trabaja uno tras otro lo que tiene en proceso: un bloque puede tardar lo que suman todos.
    const juntos = lista.filter((t) => t.estado === "en_proceso");
    const esperadoJuntos = juntos.reduce((n, t) => n + t.horasEsperadas, 0);
    for (const t of lista) {
      if (t.estado === "detenido") {
        alertas.push({
          nivel: "rojo",
          titulo: `Problema en ${nombre}`,
          texto: `${t.pedido} (${t.cliente}): ${t.problema ?? "sin detalle"}. ${nombre} está parada con ${t.cantidad} prendas.`,
          accion: `Enviar ayuda a ${nombre}. Cuando se resuelva, tocar "Ya se resolvió" en su tableta.`,
        });
      } else if (t.estado === "en_proceso") {
        const horas = t.horasTranscurridas;
        // Sin tela, Almacén espera además los días de compra.
        const limite = esperadoJuntos + (area === "almacen" && t.aviso ? ALMACEN.diasCompraSinTela * HORAS_POR_DIA : 0);
        if (horas > limite * UMBRAL_ATASCO && horas - limite > 1) {
          const debia =
            juntos.length > 1
              ? `con los otros ${juntos.length - 1} que ${nombre} tiene en proceso debía tomar ${enDias(limite)}`
              : `debía tomar ${enDias(limite)}`;
          alertas.push({
            nivel: "rojo",
            titulo: `Atascado en ${nombre}`,
            texto: `${t.pedido}: ${t.titulo} lleva ${enDias(horas)} en proceso y ${debia} (capacidad: ${t.capacidadDia} por día).`,
            accion: `Preguntar a ${nombre} qué pasó: puede haber una máquina malograda o falta de personal sin reportar.`,
          });
        }
      }
    }
    const toque = ultimoToque.get(area);
    if (lista.some((t) => t.estado === "en_proceso") && toque) {
      const horas = horasHabilesEntre(toque, ahora);
      if (horas >= HORAS_SIN_REPORTE) {
        alertas.push({
          nivel: "amarillo",
          titulo: `${nombre} sin reporte`,
          texto: `No registra avance hace ${horas.toFixed(0)} horas de trabajo.`,
          accion: `Verificar que ${nombre} esté marcando sus bloques en la tableta.`,
        });
      }
    }
  }

  // Área ociosa: no tiene nada y el área anterior tiene bloques que vienen hacia ella.
  for (const area of ORDEN_AREAS) {
    if (area === "almacen" || tarjetas[area].length > 0) continue;
    const origenes = new Map<string, number>();
    for (const p of filas) {
      if (!EN_PLANTA.includes(p.estado)) continue;
      for (const b of p.bloques) {
        if (b.estado === "terminado") continue;
        const enAlmacen = p.almacen_estado !== "terminado";
        const viene = enAlmacen ? b.ruta[0] === area : b.ruta[b.paso + 1] === area;
        if (!viene) continue;
        const origen = enAlmacen ? AREAS.almacen.nombre : AREAS[b.ruta[b.paso]].nombre;
        origenes.set(origen, (origenes.get(origen) ?? 0) + b.cantidad);
      }
    }
    for (const [origen, prendas] of origenes) {
      alertas.push({
        nivel: "amarillo",
        titulo: `${AREAS[area].nombre} sin trabajo`,
        texto: `${AREAS[area].nombre} tiene toda su capacidad libre y ${origen} tiene ${prendas} prendas que van hacia allá.`,
        accion: `Apurar a ${origen} para que libere bloques.`,
      });
    }
  }

  // Cuello de botella: el área con más días de trabajo encima.
  const cuello = carga.reduce((a, b) => (b.dias > a.dias ? b : a));
  if (cuello.dias >= DIAS_CUELLO) {
    alertas.push({
      nivel: "amarillo",
      titulo: `Cuello de botella: ${cuello.nombre}`,
      texto: `Tiene ${cuello.prendas} prendas encima y tardará ${enDias(cuello.dias * HORAS_POR_DIA)} en liberarse.`,
      accion: `Evaluar horas extra o apoyo de otra área en ${cuello.nombre}, y avisar a ventas antes de prometer fechas cortas.`,
    });
  }

  for (const p of pedidos) {
    if (p.estado === "listo") {
      alertas.push({
        nivel: "verde",
        titulo: "Listo para entrega",
        texto: `${p.codigo} (${p.cliente}): ${p.resumen}.`,
        accion: "Ventas debe coordinar la entrega con el cliente.",
      });
    } else if (p.margenDias !== null && p.margenDias < 0) {
      alertas.push({
        nivel: "rojo",
        titulo: `${p.codigo} llegará tarde`,
        texto: `${p.cliente}: terminaría el ${fechaCorta(p.fechaEstimada)}, ${-p.margenDias} ${p.margenDias === -1 ? "día hábil" : "días hábiles"} después de lo prometido.`,
        accion: p.urgente
          ? `Ya es urgente. Reprogramar con el cliente al ${fechaCorta(p.fechaSugerida)} o reforzar el área donde está.`
          : `Hacerlo urgente para que pase delante, o reprogramar con el cliente al ${fechaCorta(p.fechaSugerida)}. Los botones están en el pedido.`,
      });
    } else if (p.margenDias === 0) {
      alertas.push({
        nivel: "amarillo",
        titulo: `${p.codigo} sin margen`,
        texto: `${p.cliente}: terminaría el mismo día prometido.`,
        accion: "Vigilarlo: cualquier retraso lo deja fuera de fecha.",
      });
    }
  }
  const orden = { rojo: 0, amarillo: 1, verde: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

  return {
    pedidos,
    tarjetas,
    carga,
    alertas,
    urgentesActivos: filas.filter((p) => p.urgente && EN_PLANTA.includes(p.estado)).length,
  };
}

function enDias(horas: number): string {
  if (horas < HORAS_POR_DIA) return `${Math.max(1, Math.round(horas))} h`;
  const dias = horas / HORAS_POR_DIA;
  const texto = dias.toFixed(1).replace(".0", "").replace(".", ",");
  return `${texto} ${texto === "1" ? "día" : "días"}`;
}

export function fechaEnPeru(instante: string): string {
  return new Date(new Date(instante).getTime() - 5 * 3600000).toISOString().slice(0, 10);
}
