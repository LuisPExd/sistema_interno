import Link from "next/link";
import { fechaCorta, margenEnTexto } from "@/lib/formato";
import type { PedidoVista } from "@/lib/planta";

const COLOR = {
  verde: { punto: "bg-green-600", barra: "bg-green-600", texto: "text-green-700" },
  amarillo: { punto: "bg-amber-500", barra: "bg-amber-500", texto: "text-amber-700" },
  rojo: { punto: "bg-red-600", barra: "bg-red-600", texto: "text-red-700" },
};

/** Un pedido con su semáforo, avance y fechas. Se usa en Ventas y en el Dashboard. */
export function FilaPedido({ p, children }: { p: PedidoVista; children?: React.ReactNode }) {
  const c = COLOR[p.semaforo];
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-4 w-4 rounded-full ${c.punto}`} />
        <Link href={`/pedido/${p.codigo}`} className="text-xl font-extrabold text-marca underline">
          {p.codigo}
        </Link>
        {p.urgente && <span className="rounded-full bg-red-600 px-2 py-0.5 text-sm font-bold text-white">URGENTE</span>}
        <span className="text-lg font-semibold">{p.cliente}</span>
        <span className="ml-auto text-lg font-bold">{p.avance}%</span>
      </div>
      <p className="mt-1 text-gray-700">{p.resumen}</p>
      <div className="mt-2 h-3 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full ${c.barra}`} style={{ width: `${p.avance}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-base text-gray-700">
        {p.estado === "listo" ? (
          <span className="font-bold text-green-700">Listo para entrega</span>
        ) : (
          <span>
            En: <b>{p.areas.join(", ") || "—"}</b>
          </span>
        )}
        <span>
          Prometido: <b>{fechaCorta(p.fechaPrometida)}</b>
        </span>
        {p.estado !== "listo" && (
          <>
            <span>
              Termina producción: <b>{fechaCorta(p.fechaEstimada)}</b>
            </span>
            <span className={`font-bold ${c.texto}`}>
              {p.detenido ? "Detenido por un problema" : margenEnTexto(p.margenDias)}
            </span>
          </>
        )}
      </div>
      {children}
    </article>
  );
}
