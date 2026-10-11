import { hoyEnPeru } from "@/lib/calendario";
import { cargarCola } from "@/lib/planta";
import { json, leerJson, preflight, respuestaDeError } from "@/lib/http";
import { estimar, trabajoDesdeItems } from "@/lib/simulador";
import { validarItems } from "@/lib/validar";

export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    const cuerpo = await leerJson(request);
    const items = validarItems(cuerpo.items);
    // Este servicio es público: siempre estima con tela y sin urgencia, y nunca devuelve pedidos de
    // otros clientes. "No hay tela" y "urgente" solo los simula ventas, con sesión, desde su pantalla.
    const nuevo = trabajoDesdeItems("simulacion", items);
    const estimacion = estimar(await cargarCola(), nuevo, hoyEnPeru());
    return json({
      fecha_estimada: estimacion.fecha_estimada,
      dias_habiles: estimacion.dias_habiles,
      detalle: estimacion.detalle,
    });
  } catch (e) {
    return respuestaDeError(e);
  }
}
