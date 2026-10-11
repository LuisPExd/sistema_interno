// Pedidos de demostración con unas cinco semanas de historia, para probar las pantallas y el análisis.
// Los usan el botón de Configuración y el comando "npm run sembrar". Los pedidos demo se reconocen
// por el teléfono DEMO; los pedidos reales no se tocan.
//
// La historia cuenta el problema de la empresa: ventas acepta más trabajo del que la planta puede
// hacer y promete cada fecha como si la planta estuviera vacía. La planta sí trabaja a su ritmo
// (una cosa a la vez por área, en horario de trabajo), así que la cola crece y las entregas se atrasan.

import type { SupabaseClient } from "@supabase/supabase-js";
import { diaHabil, esHabil, hoyEnPeru } from "./calendario";
import {
  ALMACEN,
  AREAS,
  buscarProducto,
  dividirEnBloques,
  minutosPorPrenda,
  rutaDe,
  type AreaId,
  type FamiliaId,
  type Personalizacion,
} from "./catalogo";
import { estimar, trabajoDesdeItems } from "./simulador";

const MARCA = "DEMO";
/** Días de trabajo de historia. */
const DIAS = 30;
/** Trabajo que se acepta por cada día de capacidad de Confección. */
const SOBRECARGA = 1.35;
const HORAS_POR_DIA = 8;

function ok<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

// Azar con semilla fija: el demo sale igual cada vez.
const SEMILLA = 20261010;
let semilla = SEMILLA;
function azar01(): number {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (min: number, max: number) => min + azar01() * (max - min);
const elegir = <T>(lista: T[]): T => lista[Math.floor(azar01() * lista.length)];
/** Cantidad al azar, redondeada a la decena. */
const cantidad = (min: number, max: number) => Math.round(entre(min, max) / 10) * 10;

const CLIENTES = [
  ["Rosa Chunga", "Agroexportadora Valle Norte"],
  ["Luis Zapata", "Restaurante El Muelle"],
  ["Carmen Farfán", "Clínica San Miguel"],
  ["Jorge Sosa", "Constructora Pirhua"],
  ["Milagros Ramos", "Colegio Santa María"],
  ["Pedro Castillo", "Pesquera Bayóvar"],
  ["Ana Lucía Vega", "Hotel Costa del Sol Demo"],
  ["Hermandad", "Hermandad Señor Cautivo - Sullana"],
  ["Diego Morales", "Minera Tambogrande"],
  ["Sofía Calle", "Panadería La Espiga"],
  ["Municipalidad", "Municipalidad de Catacaos"],
];

const COLORES = ["Azul marino", "Blanco", "Negro", "Gris", "Verde", "Rojo", "Beige"];
const MOTIVOS = ["Máquina malograda", "Falta material", "Falta personal", "Otro problema: se fue la luz"];

type ItemDemo = { producto: string; cantidad: number };

/** Pedidos típicos; los que se repiten salen más seguido. */
const TIPOS: (() => ItemDemo[])[] = [
  () => [{ producto: "polo-camisero", cantidad: cantidad(60, 160) }],
  () => [{ producto: "polo-cuello-redondo", cantidad: cantidad(80, 200) }],
  () => [{ producto: "polo-manga-larga", cantidad: cantidad(50, 120) }],
  () => [{ producto: "polo-sublimado", cantidad: cantidad(60, 150) }],
  () => [{ producto: "camisa-corporativa", cantidad: cantidad(40, 90) }],
  () => [{ producto: "uniforme-camisa-pantalon", cantidad: cantidad(30, 60) }],
  () => [{ producto: "chaqueta-chef", cantidad: cantidad(20, 50) }],
  () => [{ producto: "mameluco", cantidad: cantidad(30, 50) }],
  () => [{ producto: elegir(["mandil", "delantal"]), cantidad: cantidad(60, 150) }],
  () => [
    { producto: "gorro-cocina", cantidad: cantidad(60, 120) },
    { producto: "chaqueta-chef", cantidad: cantidad(20, 40) },
  ],
  () => [
    { producto: "polo-camisero", cantidad: cantidad(60, 120) },
    { producto: "pantalon-industrial", cantidad: cantidad(30, 60) },
  ],
  () => [{ producto: "casaca-corporativa", cantidad: cantidad(30, 50) }],
];

// ---------- Tiempo ----------
// El tiempo se cuenta en días de trabajo desde el inicio de la historia: 3,5 es el mediodía del cuarto día.

/** Los últimos días de trabajo, del más antiguo a hoy (o al último, si hoy no se trabaja). */
function diasDeTrabajo(): string[] {
  const fechas: string[] = [];
  const d = new Date(`${hoyEnPeru()}T00:00:00Z`);
  while (fechas.length < DIAS) {
    const fecha = d.toISOString().slice(0, 10);
    if (esHabil(fecha)) fechas.unshift(fecha);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return fechas;
}

type PasoDemo = { area: AreaId; inicio: number; fin: number; problema?: { desde: number; hasta: number; motivo: string } };
type BloqueDemo = { item: number; cantidad: number; familia: FamiliaId; ruta: AreaId[]; pasos: PasoDemo[] };
type PedidoDemo = {
  cliente: string[];
  llegada: number;
  items: (ItemDemo & { personalizacion: Personalizacion })[];
  hayTela: boolean;
  prendas: number;
  prometida: string;
  almacen: { inicio: number; fin: number };
  bloques: BloqueDemo[];
  /** Cuándo sale el último bloque. */
  listo: number;
  recojo: number;
};

/** Borra los pedidos demo que haya y carga otros nuevos. Devuelve una línea por pedido creado. */
export async function sembrarDemo(db: SupabaseClient): Promise<string[]> {
  await borrarDemo(db);
  semilla = SEMILLA;
  const creados: string[] = [];
  const fechas = diasDeTrabajo();
  const hoy = hoyEnPeru();
  // Hasta dónde llega la historia: la hora de ahora si hoy se trabaja, o el cierre del último día.
  const horaPeru = ((Date.now() - 5 * 3600000) % 86400000) / 3600000;
  const ahora = fechas[DIAS - 1] === hoy ? DIAS - 1 + Math.min(1, Math.max(0, (horaPeru - 8) / HORAS_POR_DIA)) : DIAS;
  const fechaDe = (t: number) => fechas[Math.min(DIAS - 1, Math.floor(t))];
  const instante = (t: number) => {
    const dia = Math.min(DIAS - 1, Math.floor(t));
    const horas = 8 + 5 + (t - dia) * HORAS_POR_DIA;
    return new Date(new Date(`${fechas[dia]}T00:00:00Z`).getTime() + horas * 3600000).toISOString();
  };

  // 1. Pedidos que ventas acepta: más trabajo del que Confección puede hacer.
  const pedidos: PedidoDemo[] = [];
  const libre: Record<string, number> = {};
  for (let llegada = 0.2, n = 0; llegada < ahora; n++) {
    const items = elegir(TIPOS)().map((i) => ({
      ...i,
      personalizacion: buscarProducto(i.producto)!.personalizacionPorDefecto,
    }));
    const hayTela = azar01() > 0.12;
    const prendas = items.reduce((s, i) => s + i.cantidad, 0);
    // Ventas promete como si la planta estuviera vacía: no mira la cola.
    const prometida = estimar([], trabajoDesdeItems(`demo-${n}`, items, { hayTela }), fechaDe(llegada)).fecha_estimada;

    // 2. La planta lo trabaja en orden de llegada, una cosa a la vez por área.
    const inicioAlmacen = Math.max(llegada, libre.almacen ?? 0);
    const finAlmacen = inicioAlmacen + Math.max(ALMACEN.minimoDias, prendas / ALMACEN.prendasPorDia) * entre(0.9, 1.15);
    libre.almacen = finAlmacen;
    // La compra de tela retrasa al pedido pero no ocupa a Almacén.
    const salida = finAlmacen + (hayTela ? 0 : ALMACEN.diasCompraSinTela);

    let carga = 0;
    const bloques: BloqueDemo[] = items.flatMap((item, i) => {
      const familia = buscarProducto(item.producto)!.familia;
      const ruta = rutaDe(familia, item.personalizacion);
      carga += ruta.includes("confeccion") ? (item.cantidad * minutosPorPrenda(familia, "confeccion")) / AREAS.confeccion.minutosPorDia : 0;
      return dividirEnBloques(item.cantidad, familia).map((cant) => ({ item: i, cantidad: cant, familia, ruta, pasos: [] }));
    });
    for (const b of bloques) {
      let listo = salida;
      for (const area of b.ruta) {
        const inicio = Math.max(listo, libre[area] ?? 0);
        const duracion = ((b.cantidad * minutosPorPrenda(b.familia, area)) / AREAS[area].minutosPorDia) * entre(0.85, 1.2);
        const paso: PasoDemo = { area, inicio, fin: inicio + duracion };
        if (azar01() < 0.07) {
          const desde = inicio + duracion * entre(0.2, 0.7);
          const parada = entre(0.1, 0.8);
          paso.problema = { desde, hasta: desde + parada, motivo: elegir(MOTIVOS) };
          paso.fin += parada;
        }
        libre[area] = paso.fin;
        listo = paso.fin;
        b.pasos.push(paso);
      }
    }
    const listo = Math.max(...bloques.map((b) => b.pasos[b.pasos.length - 1].fin));
    pedidos.push({
      cliente: CLIENTES[n % CLIENTES.length],
      llegada,
      items,
      hayTela,
      prendas,
      prometida,
      almacen: { inicio: inicioAlmacen, fin: salida },
      bloques,
      listo,
      recojo: listo + entre(0.3, 2.5),
    });
    // El siguiente llega antes de que la planta pueda con este.
    llegada += (Math.max(carga, 0.3) / SOBRECARGA) * entre(0.6, 1.4);
  }

  // 3. Se guarda todo lo que ya pasó; lo que falta queda como estado actual de la planta.
  const yaPaso = (t: number) => t <= ahora;
  let detenidoHoy = false;
  let reprogramados = 0;
  for (const [n, p] of pedidos.entries()) {
    const terminado = yaPaso(p.listo);
    const entregado = terminado && yaPaso(p.recojo);
    const tarde = terminado && fechaDe(p.listo) > p.prometida;
    // A dos de los que salieron tarde ventas les cambió la fecha: el análisis sigue contando la primera.
    const reprogramar = tarde && reprogramados < 2 && p.listo - 1 > p.llegada;
    const nuevaFecha = reprogramar ? diaHabil(fechaDe(p.listo), 1) : null;
    if (reprogramar) reprogramados++;
    const almacenEstado = yaPaso(p.almacen.fin) ? "terminado" : yaPaso(p.almacen.inicio) ? "en_proceso" : "en_cola";

    const { data: pedido } = ok(
      await db
        .from("pedidos")
        .insert({
          cliente_nombre: p.cliente[0],
          cliente_empresa: p.cliente[1],
          cliente_telefono: MARCA,
          canal: elegir(["web", "presencial"]),
          // Uno de los que siguen en cola va como urgente, para ver cómo pasa delante.
          urgente: !terminado && n === pedidos.length - 3,
          hay_tela: p.hayTela,
          estado: entregado ? "entregado" : terminado ? "listo" : almacenEstado === "en_cola" ? "confirmado" : "en_produccion",
          almacen_estado: almacenEstado,
          almacen_inicio: almacenEstado === "en_proceso" ? instante(p.almacen.inicio) : null,
          fecha_prometida: nuevaFecha ?? p.prometida,
          creado_en: instante(p.llegada),
        })
        .select("id, codigo")
        .single(),
    );
    const id = pedido!.id;

    const { data: filasItems } = ok(
      await db
        .from("pedido_items")
        .insert(p.items.map((i) => ({ pedido_id: id, producto: i.producto, cantidad: i.cantidad, personalizacion: i.personalizacion, color: elegir(COLORES) })))
        .select("id"),
    );

    const filas = p.bloques.map((b, i) => {
      const hechos = b.pasos.filter((x) => yaPaso(x.fin)).length;
      const actual = b.pasos[hechos];
      const empezo = actual && almacenEstado === "terminado" && yaPaso(actual.inicio);
      let estado = !actual ? "terminado" : empezo ? "en_proceso" : "en_cola";
      if (empezo && actual.problema && yaPaso(actual.problema.desde) && !yaPaso(actual.problema.hasta)) estado = "detenido";
      // Para que el tablero muestre un problema abierto: se detiene un bloque fuera de Confección.
      if (estado === "en_proceso" && !detenidoHoy && actual.area !== "confeccion" && !actual.problema) {
        actual.problema = { desde: Math.max(actual.inicio, ahora - 0.2), hasta: ahora + 1, motivo: "Máquina malograda" };
        estado = "detenido";
      }
      if (estado === "detenido") detenidoHoy = true;
      return {
        pedido_id: id,
        item_id: filasItems![b.item].id,
        numero: i + 1,
        cantidad: b.cantidad,
        familia: b.familia,
        ruta: b.ruta,
        paso: hechos,
        estado,
        inicio_paso: empezo ? instante(actual.inicio) : null,
      };
    });
    const { data: filasBloques } = ok(await db.from("bloques").insert(filas).select("id, numero"));
    const idDe = new Map(filasBloques!.map((f) => [f.numero, f.id]));

    const eventos: Record<string, unknown>[] = [];
    const anotar = (t: number, area: string, tipo: string, bloque: number | null = null, detalle: string | null = null) => {
      if (yaPaso(t)) eventos.push({ pedido_id: id, bloque_id: bloque, area, tipo, detalle, creado_en: instante(t) });
    };
    anotar(p.llegada, "ventas", "empezar");
    anotar(p.almacen.inicio, "almacen", "empezar");
    anotar(p.almacen.fin, "almacen", "terminar");
    p.bloques.forEach((b, i) => {
      for (const x of b.pasos) {
        anotar(x.inicio, x.area, "empezar", idDe.get(i + 1));
        if (x.problema) {
          anotar(x.problema.desde, x.area, "problema", idDe.get(i + 1), x.problema.motivo);
          anotar(x.problema.hasta, x.area, "resuelto", idDe.get(i + 1));
        }
        anotar(x.fin, x.area, "terminar", idDe.get(i + 1));
      }
    });
    if (reprogramar) anotar(p.listo - 1, "ventas", "resuelto", null, `Fecha prometida: de ${p.prometida} a ${nuevaFecha}`);
    if (entregado) anotar(p.recojo, "ventas", "terminar");
    ok(await db.from("eventos").insert(eventos));

    const resumen = p.items.map((i) => `${i.cantidad} ${buscarProducto(i.producto)!.nombre}`).join(" + ");
    const nota = terminado ? `listo ${fechaDe(p.listo)}${tarde ? " TARDE" : ""}` : "en planta";
    creados.push(`${pedido!.codigo}  aceptado ${fechaDe(p.llegada)}  prometido ${p.prometida}  ${nota.padEnd(22)} ${resumen}`);
  }
  return creados;
}

/** Borra solo los pedidos demo. Devuelve cuántos eran. */
export async function borrarDemo(db: SupabaseClient): Promise<number> {
  const { data } = ok(await db.from("pedidos").delete().eq("cliente_telefono", MARCA).select("codigo"));
  return data!.length;
}
