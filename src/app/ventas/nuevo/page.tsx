import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { exigir } from "@/lib/acceso";
import { PRODUCTOS } from "@/lib/catalogo";
import { FormularioPedido } from "./FormularioPedido";

export default function PaginaNuevoPedido() {
  return (
    <>
      <Cabecera titulo="Nuevo pedido" />
      <Suspense fallback={<Cargando />}>
        <Formulario />
      </Suspense>
    </>
  );
}

async function Formulario() {
  await exigir("ventas");
  return (
    <FormularioPedido
      productos={PRODUCTOS.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        personalizaciones: p.personalizaciones,
        porDefecto: p.personalizacionPorDefecto,
        minimo: p.minimo,
      }))}
    />
  );
}
