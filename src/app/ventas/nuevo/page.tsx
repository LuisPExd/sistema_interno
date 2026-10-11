import { Cabecera } from "@/componentes/Cabecera";
import { PRODUCTOS } from "@/lib/catalogo";
import { FormularioPedido } from "./FormularioPedido";

export default function PaginaNuevoPedido() {
  return (
    <>
      <Cabecera titulo="Nuevo pedido" />
      <FormularioPedido
        productos={PRODUCTOS.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          personalizaciones: p.personalizaciones,
          porDefecto: p.personalizacionPorDefecto,
          minimo: p.minimo,
        }))}
      />
    </>
  );
}
