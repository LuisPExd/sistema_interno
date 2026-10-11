import Link from "next/link";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { FilaPedido } from "@/componentes/FilaPedido";
import { Refrescar } from "@/componentes/Refrescar";
import { exigir } from "@/lib/acceso";
import { cargarPlanta } from "@/lib/planta";
import { BotonEntregar } from "./BotonEntregar";

export default function PaginaVentas() {
  return (
    <>
      <Cabecera titulo="Ventas">
        <Link href="/ventas/historial" className="rounded-xl bg-white/15 px-4 py-2 font-semibold active:bg-white/30">
          Entregados
        </Link>
        <Link href="/ventas/nuevo" className="rounded-xl bg-acento px-5 py-2 text-xl font-extrabold text-marca active:scale-95">
          + Nuevo pedido
        </Link>
      </Cabecera>
      <Suspense fallback={<Cargando />}>
        <Ventas />
      </Suspense>
    </>
  );
}

async function Ventas() {
  await exigir("ventas");
  const { pedidos } = await cargarPlanta();
  const listos = pedidos.filter((p) => p.estado === "listo");
  const activos = pedidos.filter((p) => p.estado !== "listo");
  const titulo = "text-xl font-bold text-gray-600 uppercase tracking-wide";

  return (
    <main className="flex-1 p-3 sm:p-5 max-w-5xl w-full mx-auto space-y-6">
      <Refrescar />

      <section className="space-y-3">
        <h2 className={titulo}>Listos para entregar ({listos.length})</h2>
        {listos.length === 0 && <p className="rounded-2xl bg-white p-5 text-lg text-gray-500">Ninguno por ahora.</p>}
        {listos.map((p) => (
          <FilaPedido key={p.id} p={p}>
            <div className="mt-3 text-right">
              <BotonEntregar id={p.id} />
            </div>
          </FilaPedido>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className={titulo}>En producción ({activos.length})</h2>
        {activos.length === 0 && <p className="rounded-2xl bg-white p-5 text-lg text-gray-500">No hay pedidos en producción.</p>}
        {activos.map((p) => (
          <FilaPedido key={p.id} p={p} />
        ))}
      </section>
    </main>
  );
}
