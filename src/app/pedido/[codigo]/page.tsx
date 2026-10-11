import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { fechaCorta, fechaHora } from "@/lib/formato";
import { cargarTraza } from "@/lib/historial";

type Props = { params: Promise<{ codigo: string }> };

export default function PaginaPedido({ params }: Props) {
  return (
    <>
      <Cabecera titulo="Seguimiento del pedido" />
      <Suspense fallback={<Cargando />}>
        <Pedido params={params} />
      </Suspense>
    </>
  );
}

const ESTADO = {
  borrador: "Borrador",
  confirmado: "Confirmado, esperando Almacén",
  en_produccion: "En producción",
  listo: "Listo para entrega",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

async function Pedido({ params }: Props) {
  const traza = await cargarTraza((await params).codigo);
  if (!traza) notFound();
  const { pedido: p } = traza;
  const titulo = "text-xl font-bold text-gray-600 uppercase tracking-wide";

  return (
    <main className="flex-1 p-5 max-w-4xl w-full mx-auto space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-extrabold text-marca">{p.codigo}</span>
          {p.urgente && <span className="rounded-full bg-red-600 px-3 py-1 font-bold text-white">URGENTE</span>}
          <span className="rounded-full bg-marca-suave px-3 py-1 text-lg font-bold text-marca">{ESTADO[p.estado]}</span>
        </div>
        <p className="mt-2 text-2xl font-bold">{p.cliente_empresa || p.cliente_nombre}</p>
        <p className="text-xl text-gray-700">{traza.resumen}</p>
        <p className="mt-2 text-lg text-gray-600">
          {traza.prendas} prendas · Entrega prometida: <b>{fechaCorta(p.fecha_prometida)}</b> · Llegó por{" "}
          {p.canal === "web" ? `la web (${p.cotizacion_codigo ?? "sin código"})` : "atención presencial"}
          {!p.hay_tela && " · Requería comprar tela"}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className={titulo}>Dónde está cada bloque</h2>
        <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
          <table className="w-full text-lg">
            <tbody>
              {traza.bloques.map((b) => (
                <tr key={b.numero} className="border-t border-gray-200 first:border-0">
                  <td className="px-4 py-2 font-bold">Bloque {b.numero}</td>
                  <td className="px-4 py-2">{b.titulo}</td>
                  <td className="px-4 py-2 font-semibold">{b.donde}</td>
                  <td className="px-4 py-2 text-gray-600">{b.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={titulo}>Línea de tiempo</h2>
        {traza.pasos.length === 0 && <p className="rounded-2xl bg-white p-5 text-lg text-gray-500">Sin movimientos todavía.</p>}
        <ol className="space-y-2">
          {traza.pasos.map((x, i) => (
            <li key={i} className="rounded-xl bg-white p-3 shadow-sm flex flex-wrap items-center gap-x-4 text-lg">
              <span className="w-32 font-bold text-marca">{x.area}</span>
              <span className="font-semibold">{x.que}</span>
              {x.detalle && <span className="text-gray-600">{x.detalle}</span>}
              <span className="ml-auto text-base text-gray-500">{fechaHora(x.cuando)}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
