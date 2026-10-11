import Link from "next/link";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { fechaCorta } from "@/lib/formato";
import { cargarEntregados } from "@/lib/historial";

export default function PaginaEntregados() {
  return (
    <>
      <Cabecera titulo="Pedidos entregados">
        <Link href="/ventas" className="rounded-xl bg-white/15 px-4 py-2 font-semibold active:bg-white/30">
          Volver a Ventas
        </Link>
      </Cabecera>
      <Suspense fallback={<Cargando />}>
        <Entregados />
      </Suspense>
    </>
  );
}

async function Entregados() {
  const pedidos = await cargarEntregados();
  const conFecha = pedidos.filter((p) => p.aTiempo !== null);
  const aTiempo = conFecha.filter((p) => p.aTiempo).length;

  return (
    <main className="flex-1 p-5 max-w-5xl w-full mx-auto space-y-4">
      <p className="text-xl">
        <b>{pedidos.length}</b> pedidos entregados
        {conFecha.length > 0 && (
          <>
            {" "}
            · <b>{aTiempo}</b> de {conFecha.length} a tiempo
          </>
        )}
      </p>
      {pedidos.length === 0 && <p className="rounded-2xl bg-white p-5 text-lg text-gray-500">Todavía no se ha entregado ningún pedido.</p>}
      {pedidos.map((p) => (
        <article key={p.codigo} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/pedido/${p.codigo}`} className="text-xl font-extrabold text-marca underline">
              {p.codigo}
            </Link>
            <span className="text-lg font-semibold">{p.cliente}</span>
            {p.aTiempo !== null && (
              <span
                className={`ml-auto rounded-full px-3 py-1 font-bold ${p.aTiempo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
              >
                {p.aTiempo ? "A tiempo" : "Tarde"}
              </span>
            )}
          </div>
          <p className="mt-1 text-gray-700">{p.resumen}</p>
          <p className="mt-1 text-base text-gray-600">
            Registrado: <b>{fechaCorta(p.registrado)}</b> · Prometido: <b>{fechaCorta(p.prometido)}</b> · Entregado:{" "}
            <b>{fechaCorta(p.entregado)}</b>
          </p>
        </article>
      ))}
    </main>
  );
}
