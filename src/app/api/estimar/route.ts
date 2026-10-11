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
    // La web siempre estima con tela; "no hay tela" y "urgente" solo los usa ventas.
    const nuevo = trabajoDesdeItems("simulacion", items, {
      hayTela: cuerpo.hay_tela !== false,
      urgente: cuerpo.urgente === true,
    });
    const { afectados, ...estimacion } = estimar(await cargarCola(), nuevo, hoyEnPeru());
    // "afectados" solo le sirve a ventas al simular un urgente; a la web no se le envía.
    return json(nuevo.urgente ? { ...estimacion, afectados } : estimacion);
  } catch (e) {
    return respuestaDeError(e);
  }
}
