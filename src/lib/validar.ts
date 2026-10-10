import { buscarProducto, type Personalizacion } from "./catalogo";
import type { Item } from "./simulador";

export class ErrorDeDatos extends Error {}

export type ItemCotizado = Item & {
  color?: string;
  tallas?: Record<string, number>;
  notas?: string;
};

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Valida la lista de ítems que llega de la web o de ventas. Lanza ErrorDeDatos con un mensaje legible. */
export function validarItems(entrada: unknown, opciones: { exigirTallas?: boolean } = {}): ItemCotizado[] {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    throw new ErrorDeDatos("Falta la lista de items.");
  }
  return entrada.map((crudo, i) => {
    const n = i + 1;
    if (!esObjeto(crudo)) throw new ErrorDeDatos(`El item ${n} no es válido.`);

    const producto = typeof crudo.producto === "string" ? buscarProducto(crudo.producto) : undefined;
    if (!producto) throw new ErrorDeDatos(`El item ${n} tiene un producto que no existe: ${String(crudo.producto)}.`);

    const cantidad = crudo.cantidad;
    if (typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad < 1) {
      throw new ErrorDeDatos(`El item ${n} necesita una cantidad entera mayor a cero.`);
    }
    if (cantidad < producto.minimo) {
      throw new ErrorDeDatos(`${producto.nombre}: el pedido mínimo es de ${producto.minimo} unidades.`);
    }

    const personalizacion = (crudo.personalizacion ?? producto.personalizacionPorDefecto) as Personalizacion;
    if (!producto.personalizaciones.includes(personalizacion)) {
      throw new ErrorDeDatos(
        `${producto.nombre} no admite la personalización "${String(personalizacion)}". Opciones: ${producto.personalizaciones.join(", ")}.`,
      );
    }

    const item: ItemCotizado = { producto: producto.id, cantidad, personalizacion };

    if (crudo.tallas !== undefined) {
      if (!esObjeto(crudo.tallas)) throw new ErrorDeDatos(`El item ${n} tiene tallas no válidas.`);
      let suma = 0;
      for (const v of Object.values(crudo.tallas)) {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
          throw new ErrorDeDatos(`El item ${n} tiene tallas no válidas.`);
        }
        suma += v;
      }
      if (suma !== cantidad) {
        throw new ErrorDeDatos(`${producto.nombre}: las tallas suman ${suma} y la cantidad es ${cantidad}.`);
      }
      item.tallas = crudo.tallas as Record<string, number>;
    } else if (opciones.exigirTallas) {
      throw new ErrorDeDatos(`${producto.nombre}: faltan las tallas.`);
    }

    if (typeof crudo.color === "string") item.color = crudo.color;
    if (typeof crudo.notas === "string") item.notas = crudo.notas;
    return item;
  });
}
