import { PRODUCTOS } from "@/lib/catalogo";
import { json, preflight } from "@/lib/http";

export const OPTIONS = preflight;

export async function GET() {
  return json(
    PRODUCTOS.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      linea: p.linea,
      personalizaciones: p.personalizaciones,
      personalizacion_por_defecto: p.personalizacionPorDefecto,
      minimo: p.minimo,
    })),
  );
}
