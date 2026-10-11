"use server";

import { refresh, updateTag } from "next/cache";
import { exigir } from "@/lib/acceso";
import { diaHabil, hoyEnPeru } from "@/lib/calendario";
import {
  MARGEN,
  MAX_URGENTES_ACTIVOS,
  ORDEN_AREAS,
  buscarProducto,
  dividirEnBloques,
  rutaDe,
  type AreaId,
} from "@/lib/catalogo";
import { BUCKET_DISENOS, db } from "@/lib/db";
import { ETIQUETA_PLANTA, aTrabajos, cargarPedidos } from "@/lib/planta";
import { estadoDeCola, estimar, trabajoDesdeItems, type Estimacion } from "@/lib/simulador";
import { ErrorDeDatos, validarItems, type ItemCotizado } from "@/lib/validar";

type Objetivo = { tipo: "pedido" | "bloque"; id: number; pedidoId: number };

/** Descarta la lectura guardada y vuelve a pintar la pantalla con datos frescos. */
function actualizar() {
  updateTag(ETIQUETA_PLANTA);
  refresh();
}

/** Valida el área y que quien toca tenga permiso sobre ella. */
async function exigirArea(area: string): Promise<AreaId> {
  if (!ORDEN_AREAS.includes(area as AreaId)) throw new Error(`Área desconocida: ${area}`);
  await exigir(area as AreaId);
  return area as AreaId;
}

function ok<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

async function registrar(area: AreaId, objetivo: Objetivo, tipo: string, detalle?: string) {
  ok(
    await db().from("eventos").insert({
      pedido_id: objetivo.pedidoId,
      bloque_id: objetivo.tipo === "bloque" ? objetivo.id : null,
      area,
      tipo,
      detalle: detalle ?? null,
    }),
  );
}

// ---------- Tableta de área ----------
// El cambio de estado y el registro del evento salen a la vez para que el toque responda rápido.

async function cambiarEstado(
  area: AreaId,
  objetivo: Objetivo,
  evento: "empezar" | "problema" | "resuelto",
  desde: string,
  hacia: string,
  detalle?: string,
) {
  const inicio = evento === "empezar" ? new Date().toISOString() : undefined;
  const cambio =
    objetivo.tipo === "pedido"
      ? db()
          .from("pedidos")
          .update({
            almacen_estado: hacia,
            ...(inicio && { almacen_inicio: inicio, estado: "en_produccion" }),
          })
          .eq("id", objetivo.id)
          .eq("almacen_estado", desde)
      : db()
          .from("bloques")
          .update({ estado: hacia, ...(inicio && { inicio_paso: inicio }) })
          .eq("id", objetivo.id)
          .eq("estado", desde);
  const [resultado] = await Promise.all([cambio, registrar(area, objetivo, evento, detalle)]);
  ok(resultado);
  actualizar();
}

export async function empezar(area: string, objetivo: Objetivo) {
  await cambiarEstado(await exigirArea(area), objetivo, "empezar", "en_cola", "en_proceso");
}

export async function reportarProblema(area: string, objetivo: Objetivo, motivo: string) {
  const areaValida = await exigirArea(area);
  // El motivo se muestra en la tableta, el dashboard y las alertas: no se guarda vacío ni larguísimo.
  const texto = String(motivo).trim().slice(0, 200);
  if (!texto) throw new Error("Falta indicar el problema.");
  await cambiarEstado(areaValida, objetivo, "problema", "en_proceso", "detenido", texto);
}

export async function resolverProblema(area: string, objetivo: Objetivo) {
  await cambiarEstado(await exigirArea(area), objetivo, "resuelto", "detenido", "en_proceso");
}

export async function terminar(areaCruda: string, objetivo: Objetivo) {
  const area = await exigirArea(areaCruda);
  if (objetivo.tipo === "pedido") {
    const { data } = ok(
      await db()
        .from("pedidos")
        .update({ almacen_estado: "terminado" })
        .eq("id", objetivo.id)
        .eq("almacen_estado", "en_proceso")
        .select("id"),
    );
    if (data?.length) await registrar(area, objetivo, "terminar");
    actualizar();
    return;
  }

  const { data: bloque } = ok(
    await db().from("bloques").select("pedido_id, ruta, paso, estado").eq("id", objetivo.id).single(),
  );
  // Si otra tableta ya lo movió, no se avanza dos veces.
  if (!bloque || bloque.estado !== "en_proceso" || bloque.ruta[bloque.paso] !== area) {
    actualizar();
    return;
  }
  const paso = bloque.paso + 1;
  const ultimo = paso >= bloque.ruta.length;
  const [cambio] = await Promise.all([
    db()
      .from("bloques")
      .update({ paso, estado: ultimo ? "terminado" : "en_cola", inicio_paso: null })
      .eq("id", objetivo.id)
      .eq("paso", bloque.paso),
    registrar(area, objetivo, "terminar"),
  ]);
  ok(cambio);

  if (ultimo) {
    const { count } = ok(
      await db()
        .from("bloques")
        .select("id", { count: "exact", head: true })
        .eq("pedido_id", bloque.pedido_id)
        .neq("estado", "terminado"),
    );
    if (count === 0) ok(await db().from("pedidos").update({ estado: "listo" }).eq("id", bloque.pedido_id));
  }
  actualizar();
}

// ---------- Ventas ----------

export type DatosPedido = {
  cliente: { nombre: string; empresa: string; telefono: string };
  canal: "web" | "presencial";
  cotizacionCodigo: string | null;
  urgente: boolean;
  /** Autorización del jefe de producción para pasar el límite de urgentes. */
  autorizado: boolean;
  hayTela: boolean;
  items: unknown;
};

type Respuesta<T> = ({ ok: true } & T) | { ok: false; error: string };

function comoError(e: unknown): { ok: false; error: string } {
  if (e instanceof ErrorDeDatos) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "No se pudo completar. Revisa la conexión e inténtalo otra vez." };
}

async function estimarPedido(datos: DatosPedido): Promise<{ items: ItemCotizado[]; estimacion: Estimacion; urgentes: number }> {
  const items = validarItems(datos.items);
  const pedidos = await cargarPedidos(["confirmado", "en_produccion"]);
  const nuevo = trabajoDesdeItems("simulacion", items, { urgente: datos.urgente, hayTela: datos.hayTela });
  return {
    items,
    estimacion: estimar(aTrabajos(pedidos), nuevo, hoyEnPeru()),
    urgentes: pedidos.filter((p) => p.urgente).length,
  };
}

export async function simularPedido(datos: DatosPedido): Promise<Respuesta<{ estimacion: Estimacion; urgentes: number }>> {
  await exigir("ventas");
  try {
    const { estimacion, urgentes } = await estimarPedido(datos);
    return { ok: true, estimacion, urgentes };
  } catch (e) {
    return comoError(e);
  }
}

export async function crearPedido(datos: DatosPedido): Promise<Respuesta<{ codigo: string; fechaPrometida: string }>> {
  await exigir("ventas");
  try {
    const nombre = datos.cliente.nombre.trim();
    if (!nombre) throw new ErrorDeDatos("Falta el nombre del cliente.");
    const { items, estimacion, urgentes } = await estimarPedido(datos);
    if (datos.urgente && urgentes >= MAX_URGENTES_ACTIVOS && !datos.autorizado) {
      throw new ErrorDeDatos(
        `Ya hay ${urgentes} pedidos urgentes activos. Para agregar otro marca "Autorizado por el jefe de producción".`,
      );
    }

    const { data: pedido } = ok(
      await db()
        .from("pedidos")
        .insert({
          cliente_nombre: nombre,
          cliente_empresa: datos.cliente.empresa.trim() || null,
          cliente_telefono: datos.cliente.telefono.trim() || null,
          canal: datos.canal,
          cotizacion_codigo: datos.cotizacionCodigo,
          urgente: datos.urgente,
          hay_tela: datos.hayTela,
          // Al confirmar, la fecha estimada pasa a ser la prometida (HANDOFF S4).
          fecha_prometida: estimacion.fecha_estimada,
        })
        .select("id, codigo")
        .single(),
    );

    const { data: filasItems } = ok(
      await db()
        .from("pedido_items")
        .insert(
          items.map((i) => ({
            pedido_id: pedido!.id,
            producto: i.producto,
            cantidad: i.cantidad,
            personalizacion: i.personalizacion,
            color: i.color ?? null,
            tallas: i.tallas ?? null,
            notas: i.notas ?? null,
          })),
        )
        .select("id"),
    );

    let numero = 0;
    const bloques = items.flatMap((item, i) => {
      const familia = buscarProducto(item.producto)!.familia;
      const ruta = rutaDe(familia, item.personalizacion);
      return dividirEnBloques(item.cantidad, familia).map((cantidad) => ({
        pedido_id: pedido!.id,
        item_id: filasItems![i].id,
        numero: ++numero,
        cantidad,
        familia,
        ruta,
      }));
    });
    ok(await db().from("bloques").insert(bloques));
    ok(await db().from("eventos").insert({ pedido_id: pedido!.id, area: "ventas", tipo: "empezar" }));

    actualizar();
    return { ok: true, codigo: pedido!.codigo, fechaPrometida: estimacion.fecha_estimada };
  } catch (e) {
    return comoError(e);
  }
}

export type CotizacionCargada = {
  codigo: string;
  cliente: { nombre: string; empresa: string | null; telefono: string };
  items: ItemCotizado[];
  precioTotal: number | null;
  fechaEstimada: string | null;
  disenoUrl: string | null;
};

export async function buscarCotizacion(codigoCrudo: string): Promise<Respuesta<{ cotizacion: CotizacionCargada }>> {
  await exigir("ventas");
  try {
    const digitos = codigoCrudo.replace(/\D/g, "");
    if (!digitos) throw new ErrorDeDatos("Escribe el código de la cotización, por ejemplo COT-1234.");
    const codigo = `COT-${digitos}`;
    const { data } = ok(await db().from("cotizaciones").select("*").eq("codigo", codigo).maybeSingle());
    if (!data) throw new ErrorDeDatos(`No existe la cotización ${codigo}.`);

    const { count } = ok(
      await db().from("pedidos").select("id", { count: "exact", head: true }).eq("cotizacion_codigo", codigo),
    );
    if (count) throw new ErrorDeDatos(`La cotización ${codigo} ya fue registrada como pedido.`);

    let disenoUrl: string | null = null;
    if (data.diseno_archivo) {
      const firmado = await db().storage.from(BUCKET_DISENOS).createSignedUrl(data.diseno_archivo, 3600);
      disenoUrl = firmado.data?.signedUrl ?? null;
    }
    return {
      ok: true,
      cotizacion: {
        codigo,
        cliente: data.cliente,
        items: data.items,
        precioTotal: data.precio_total,
        fechaEstimada: data.fecha_estimada,
        disenoUrl,
      },
    };
  } catch (e) {
    return comoError(e);
  }
}

export async function entregarPedido(id: number) {
  await exigir("ventas");
  const { data } = ok(
    await db().from("pedidos").update({ estado: "entregado" }).eq("id", id).eq("estado", "listo").select("id"),
  );
  if (data?.length) ok(await db().from("eventos").insert({ pedido_id: id, area: "ventas", tipo: "terminar" }));
  actualizar();
}

// ---------- Decisiones del jefe de producción ----------

async function anotar(pedidoId: number, tipo: "empezar" | "terminar" | "problema" | "resuelto", detalle?: string) {
  ok(await db().from("eventos").insert({ pedido_id: pedidoId, area: "ventas", tipo, detalle: detalle ?? null }));
}

export type EfectoUrgente = {
  /** Fecha en que terminaría producción tal como está hoy y si se cambia la prioridad. */
  antes: string;
  despues: string;
  /** Otros pedidos que cambiarían de fecha, con su margen nuevo frente a lo prometido. */
  afectados: { codigo: string; antes: string; despues: string; margen: number | null }[];
};

/** Calcula qué pasaría al cambiar la prioridad de un pedido, sin guardar nada. */
export async function evaluarUrgente(id: number, urgente: boolean): Promise<Respuesta<{ efecto: EfectoUrgente }>> {
  await exigir("decidir");
  try {
    const pedidos = await cargarPedidos(["confirmado", "en_produccion"]);
    const pedido = pedidos.find((p) => p.id === id);
    if (!pedido) throw new ErrorDeDatos("El pedido ya no está en producción.");
    const hoy = hoyEnPeru();
    const antes = estadoDeCola(aTrabajos(pedidos), hoy);
    const despues = estadoDeCola(
      aTrabajos(pedidos.map((p) => (p.id === id ? { ...p, urgente } : p))),
      hoy,
    );
    return {
      ok: true,
      efecto: {
        antes: antes.get(pedido.codigo)!.fecha_fin,
        despues: despues.get(pedido.codigo)!.fecha_fin,
        afectados: pedidos
          .filter((p) => p.id !== id && antes.get(p.codigo)!.fecha_fin !== despues.get(p.codigo)!.fecha_fin)
          .map((p) => ({
            codigo: p.codigo,
            antes: antes.get(p.codigo)!.fecha_fin,
            despues: despues.get(p.codigo)!.fecha_fin,
            margen: despues.get(p.codigo)!.margen_dias,
          })),
      },
    };
  } catch (e) {
    return comoError(e);
  }
}

export async function cambiarUrgente(id: number, urgente: boolean) {
  await exigir("decidir");
  ok(await db().from("pedidos").update({ urgente }).eq("id", id));
  await anotar(id, "problema", urgente ? "Marcado como urgente" : "Vuelve a prioridad normal");
  actualizar();
}

/** Mueve la fecha prometida al fin estimado más el margen mínimo, tras acordarlo con el cliente. */
export async function reprogramar(id: number): Promise<Respuesta<{ fecha: string }>> {
  await exigir("decidir");
  try {
    const pedidos = await cargarPedidos(["confirmado", "en_produccion"]);
    const pedido = pedidos.find((p) => p.id === id);
    if (!pedido) throw new ErrorDeDatos("El pedido ya no está en producción.");
    const fin = estadoDeCola(aTrabajos(pedidos), hoyEnPeru()).get(pedido.codigo)!.fecha_fin;
    const fecha = diaHabil(fin, MARGEN.minimoDias);
    ok(await db().from("pedidos").update({ fecha_prometida: fecha }).eq("id", id));
    await anotar(id, "resuelto", `Fecha prometida: de ${pedido.fecha_prometida ?? "sin fecha"} a ${fecha}`);
    actualizar();
    return { ok: true, fecha };
  } catch (e) {
    return comoError(e);
  }
}
