import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { Refrescar } from "@/componentes/Refrescar";
import { exigir } from "@/lib/acceso";
import { AREAS, ORDEN_AREAS, type AreaId } from "@/lib/catalogo";
import { cargarPlanta } from "@/lib/planta";
import { TableroArea } from "./TableroArea";

type Props = { params: Promise<{ area: string }> };

export default function PaginaArea({ params }: Props) {
  return (
    <Suspense fallback={<Cargando />}>
      <Area params={params} />
    </Suspense>
  );
}

async function Area({ params }: Props) {
  const { area } = await params;
  if (!ORDEN_AREAS.includes(area as AreaId)) notFound();
  const id = area as AreaId;
  await exigir(id);

  const planta = await cargarPlanta();
  const carga = planta.carga.find((c) => c.area === id)!;

  return (
    <>
      <Refrescar />
      <Cabecera titulo={AREAS[id].nombre}>
        {id !== "almacen" && (
          <span>
            Hoy salieron <b className="text-2xl text-acento">{carga.terminadasHoy}</b> prendas
          </span>
        )}
        <span className="rounded-xl bg-white/15 px-3 py-1">
          En cola: <b>{carga.enCola}</b>
        </span>
        <Link href={`/area/${id}/historial`} className="rounded-xl bg-white/15 px-4 py-2 font-semibold active:bg-white/30">
          Historial
        </Link>
      </Cabecera>
      <TableroArea area={id} tarjetas={planta.tarjetas[id]} />
    </>
  );
}
