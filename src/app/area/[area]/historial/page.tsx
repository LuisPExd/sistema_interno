import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { Refrescar } from "@/componentes/Refrescar";
import { exigir, sesion } from "@/lib/acceso";
import { AREAS, ORDEN_AREAS, type AreaId } from "@/lib/catalogo";
import { fechaCorta, fechaHora } from "@/lib/formato";
import { cargarHistorialArea } from "@/lib/historial";
import { puede } from "@/lib/roles";

type Props = { params: Promise<{ area: string }> };

export default function PaginaHistorial({ params }: Props) {
  return (
    <Suspense fallback={<Cargando />}>
      <Historial params={params} />
    </Suspense>
  );
}

const COLOR = {
  Llegó: "bg-blue-100 text-blue-900",
  Empezó: "bg-amber-100 text-amber-900",
  Terminó: "bg-green-100 text-green-900",
  Problema: "bg-red-100 text-red-900",
  Resuelto: "bg-gray-200 text-gray-800",
};

async function Historial({ params }: Props) {
  const { area } = await params;
  if (!ORDEN_AREAS.includes(area as AreaId)) notFound();
  const id = area as AreaId;
  // El historial solo se lee: también lo ve quien puede abrir el dashboard.
  const rol = await sesion();
  const delArea = rol !== null && puede(rol, id);
  if (!delArea) await exigir("dashboard");
  const { movimientos, dias } = await cargarHistorialArea(id);
  const titulo = "text-xl font-bold text-gray-600 uppercase tracking-wide";

  return (
    <>
      <Refrescar segundos={30} />
      <Cabecera titulo={`Historial de ${AREAS[id].nombre}`}>
        <Link href={`/area/${id}`} className="rounded-xl bg-white/15 px-4 py-2 font-semibold active:bg-white/30">
          Volver al área
        </Link>
      </Cabecera>
      <main className="flex-1 p-5 max-w-5xl w-full mx-auto space-y-6">
        <section className="space-y-3">
          <h2 className={titulo}>Por día</h2>
          {dias.length === 0 ? (
            <p className="rounded-2xl bg-white p-5 text-lg text-gray-500">Todavía no hay movimientos.</p>
          ) : (
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
              <table className="w-full text-lg">
                <thead className="bg-marca-suave text-left">
                  <tr>
                    <th className="px-4 py-2">Día</th>
                    <th className="px-4 py-2 text-right">Prendas que llegaron</th>
                    <th className="px-4 py-2 text-right">Prendas que salieron</th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d) => (
                    <tr key={d.fecha} className="border-t border-gray-200">
                      <td className="px-4 py-2 font-semibold">{fechaCorta(d.fecha)}</td>
                      <td className="px-4 py-2 text-right">{d.llegaron}</td>
                      <td className="px-4 py-2 text-right font-bold">{d.terminaron}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className={titulo}>Movimientos ({movimientos.length})</h2>
          {movimientos.map((m, i) => (
            <div key={i} className="rounded-xl bg-white p-3 shadow-sm flex flex-wrap items-center gap-x-4 gap-y-1 text-lg">
              <span className={`rounded-lg px-3 py-1 font-bold ${COLOR[m.que]}`}>{m.que}</span>
              <Link href={`/pedido/${m.pedido}`} className="font-extrabold text-marca underline">
                {m.pedido}
              </Link>
              <span className="font-semibold">{m.titulo}</span>
              <span className="text-gray-600">{m.cliente}</span>
              {m.detalle && <span className="text-gray-600">· {m.detalle}</span>}
              <span className="ml-auto text-base text-gray-500">{fechaHora(m.cuando)}</span>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
