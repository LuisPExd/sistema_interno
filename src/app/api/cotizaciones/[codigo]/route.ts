import { AREAS, ORDEN_AREAS, type AreaId } from "@/lib/catalogo";
import { db } from "@/lib/db";
import { json, preflight, respuestaDeError } from "@/lib/http";

export const OPTIONS = preflight;

const DECORACION: AreaId[] = ["bordado", "sublimado", "dtf"];

type Bloque = { ruta: AreaId[]; paso: number; estado: string };
type Pedido = { estado: string; almacen_estado: string; fecha_prometida: string | null; bloques: Bloque[] };

/**
 * En qué va una cotización, para que el cliente la siga desde la web o el chatbot.
 * Pide la clave que se entregó al registrarla: los códigos se pueden adivinar. No devuelve datos personales.
 */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  try {
    const codigo = (await params).codigo.toUpperCase();
    const clave = new URL(request.url).searchParams.get("clave") ?? "";
    const { data: cotizacion, error } = await db()
      .from("cotizaciones")
      .select("codigo, clave, precio_total, fecha_estimada, creado_en")
      .eq("codigo", codigo)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // La misma respuesta si no existe o si la clave no coincide, para no confirmar qué códigos existen.
    if (!cotizacion || !cotizacion.clave || cotizacion.clave !== clave) {
      return json({ error: "No se encontró la cotización o la clave no coincide." }, 404);
    }

    const { data: pedidos, error: errorPedido } = await db()
      .from("pedidos")
      .select("estado, almacen_estado, fecha_prometida, bloques (ruta, paso, estado)")
      .eq("cotizacion_codigo", codigo)
      .neq("estado", "cancelado")
      .order("id", { ascending: false })
      .limit(1);
    if (errorPedido) throw new Error(errorPedido.message);
    const pedido = (pedidos as unknown as Pedido[])[0];

    const base = { codigo, precio_confirmado: cotizacion.precio_total, fecha_estimada: cotizacion.fecha_estimada };
    if (!pedido) {
      // Todavía no la confirma ventas: no ocupa capacidad y se puede cambiar lo que sea.
      return json({ ...base, estado: "registrada", etapa: null, fecha_comprometida: null, cambios: { sencillo: true, detallado: true } });
    }

    const enAlmacen = pedido.almacen_estado !== "terminado";
    const pendientes = pedido.bloques.filter((b) => b.estado !== "terminado");
    const terminado = pedido.estado === "listo" || pedido.estado === "entregado";
    // La etapa es la del bloque más atrasado: el pedido no está más adelante que eso.
    const areas = new Set(pendientes.map((b) => b.ruta[b.paso]));
    const etapa = terminado
      ? pedido.estado === "entregado"
        ? "Entregado"
        : "Listo"
      : enAlmacen
        ? AREAS.almacen.nombre
        : AREAS[ORDEN_AREAS.find((a) => areas.has(a)) ?? "acabados"].nombre;

    // Cambio sencillo (texto o tipografía del logo): mientras ningún bloque haya llegado a Bordado, DTF o Sublimado.
    // Cambio detallado (cuello, modelo): solo mientras el pedido siga en Almacén; desde Corte ya no se puede.
    const decorado = (b: Bloque) => {
      const primera = b.ruta.findIndex((a) => DECORACION.includes(a));
      return primera >= 0 && b.paso >= primera;
    };
    return json({
      ...base,
      estado: "confirmada",
      etapa,
      fecha_comprometida: pedido.fecha_prometida,
      cambios: {
        sencillo: !terminado && (enAlmacen || !pedido.bloques.some(decorado)),
        detallado: !terminado && enAlmacen,
      },
    });
  } catch (e) {
    return respuestaDeError(e);
  }
}
