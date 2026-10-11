import Link from "next/link";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { FilaPedido } from "@/componentes/FilaPedido";
import { Refrescar } from "@/componentes/Refrescar";
import { hoyEnPeru } from "@/lib/calendario";
import { horasEnTexto } from "@/lib/formato";
import { CAPACIDAD_MENSUAL, historiaMensual } from "@/lib/historiaSimulada";
import { cargarPlanta, type CargaArea, type Tarjeta } from "@/lib/planta";
import { AccionesPedido } from "./AccionesPedido";
import { GraficaMensual } from "./GraficaMensual";

type Props = { searchParams: Promise<{ ver?: string }> };

export default function PaginaDashboard({ searchParams }: Props) {
  return (
    <>
      <Cabecera titulo="Dashboard" />
      <Suspense fallback={<Cargando />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Filtros que se activan al tocar una cifra de arriba.
const FILTROS = {
  tarde: "que llegarán tarde",
  detenidos: "detenidos por un problema",
  urgentes: "urgentes",
  listos: "listos para entregar",
} as const;
type Filtro = keyof typeof FILTROS;

const ESTILO_ALERTA = {
  rojo: "border-red-600 bg-red-50",
  amarillo: "border-amber-500 bg-amber-50",
  verde: "border-green-600 bg-green-50",
};

async function Dashboard({ searchParams }: Props) {
  const { ver } = await searchParams;
  const filtro = ver && ver in FILTROS ? (ver as Filtro) : null;
  const { pedidos, carga, alertas, tarjetas, urgentesActivos } = await cargarPlanta();
  const activos = pedidos.filter((p) => p.estado !== "listo");
  const orden = { rojo: 0, amarillo: 1, verde: 2 };
  activos.sort(
    (a, b) => orden[a.semaforo] - orden[b.semaforo] || (a.fechaPrometida ?? "").localeCompare(b.fechaPrometida ?? ""),
  );
  const tarde = activos.filter((p) => p.margenDias !== null && p.margenDias < 0).length;
  const detenidos = activos.filter((p) => p.detenido).length;
  const listos = pedidos.length - activos.length;
  const visibles =
    filtro === "tarde"
      ? activos.filter((p) => p.margenDias !== null && p.margenDias < 0)
      : filtro === "detenidos"
        ? activos.filter((p) => p.detenido)
        : filtro === "urgentes"
          ? activos.filter((p) => p.urgente)
          : filtro === "listos"
            ? pedidos.filter((p) => p.estado === "listo")
            : activos;
  const titulo = "text-xl font-bold text-gray-600 uppercase tracking-wide";

  return (
    <main className="flex-1 p-5 space-y-6">
      <Refrescar />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Cifra valor={activos.length} texto="en producción" filtro={null} activo={filtro} />
        <Cifra valor={tarde} texto="llegarán tarde" alerta={tarde > 0} filtro="tarde" activo={filtro} />
        <Cifra valor={detenidos} texto="detenidos por problema" alerta={detenidos > 0} filtro="detenidos" activo={filtro} />
        <Cifra valor={urgentesActivos} texto="urgentes activos" filtro="urgentes" activo={filtro} />
        <Cifra valor={listos} texto="listos para entregar" filtro="listos" activo={filtro} />
      </section>

      <GraficaMensual meses={historiaMensual(hoyEnPeru())} capacidad={CAPACIDAD_MENSUAL} />

      <section className="space-y-3">
        <h2 className={titulo}>Qué pasa en cada área</h2>
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {carga.map((c) => (
            <Area key={c.area} c={c} tarjetas={tarjetas[c.area]} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_3fr] content-start">
        <section className="space-y-3">
          <h2 className={titulo}>Decisiones pendientes ({alertas.length})</h2>
          {alertas.length === 0 && <p className="rounded-2xl bg-white p-6 text-lg text-gray-500">Todo en orden.</p>}
          {alertas.map((a, i) => (
            <div key={i} className={`rounded-xl border-l-8 p-3 ${ESTILO_ALERTA[a.nivel]}`}>
              <p className="text-lg font-bold">{a.titulo}</p>
              <p className="text-gray-800">{a.texto}</p>
              <p className="mt-1 font-semibold text-marca">→ {a.accion}</p>
            </div>
          ))}
        </section>

        <section id="pedidos" className="space-y-3 scroll-mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={titulo}>
              Pedidos {filtro ? FILTROS[filtro] : "en producción"} ({visibles.length})
            </h2>
            {filtro && (
              <Link href="/dashboard#pedidos" className="rounded-full bg-marca px-4 py-1 text-base font-bold text-white">
                Ver todos ✕
              </Link>
            )}
          </div>
          {visibles.length === 0 && (
            <p className="rounded-2xl bg-white p-6 text-lg text-gray-500">
              No hay pedidos {filtro ? FILTROS[filtro] : "en producción"}.
            </p>
          )}
          {visibles.map((p) => (
            <FilaPedido key={p.id} p={p}>
              {p.estado !== "listo" && (
                <AccionesPedido
                  id={p.id}
                  codigo={p.codigo}
                  urgente={p.urgente}
                  enRiesgo={p.margenDias !== null && p.margenDias < 0}
                  fechaPrometida={p.fechaPrometida}
                  fechaSugerida={p.fechaSugerida}
                />
              )}
            </FilaPedido>
          ))}
        </section>
      </div>
    </main>
  );
}

/** Cifra de resumen; al tocarla, la lista de pedidos muestra solo los de ese grupo. */
function Cifra(props: { valor: number; texto: string; alerta?: boolean; filtro: Filtro | null; activo: Filtro | null }) {
  const { valor, texto, alerta = false, filtro, activo } = props;
  const elegida = filtro === activo;
  return (
    <Link
      href={filtro ? `/dashboard?ver=${filtro}#pedidos` : "/dashboard#pedidos"}
      className={`block rounded-2xl p-4 shadow-sm active:scale-95 transition ${alerta ? "bg-red-600 text-white" : "bg-white"} ${
        elegida ? "ring-4 ring-acento" : ""
      }`}
    >
      <p className="text-4xl font-extrabold">{valor}</p>
      <p className={`text-base ${alerta ? "text-white" : "text-gray-600"}`}>
        {texto} <span className="font-bold">›</span>
      </p>
    </Link>
  );
}

/** Lo que el área tiene entre manos: qué procesa, con qué capacidad y cuándo se libera. */
function Area({ c, tarjetas }: { c: CargaArea; tarjetas: Tarjeta[] }) {
  const enProceso = tarjetas.filter((t) => t.estado !== "en_cola");
  const enCola = tarjetas.filter((t) => t.estado === "en_cola");
  const prendasEnCola = enCola.reduce((n, t) => n + t.cantidad, 0);
  const estado = enProceso.some((t) => t.estado === "detenido")
    ? { texto: "Detenida", color: "bg-red-600 text-white" }
    : tarjetas.length === 0
      ? { texto: "Sin trabajo", color: "bg-gray-200 text-gray-700" }
      : enProceso.length === 0
        ? { texto: "No ha empezado", color: "bg-amber-100 text-amber-900" }
        : c.llena
          ? { texto: "A su capacidad", color: "bg-amber-100 text-amber-900" }
          : { texto: "Trabajando", color: "bg-green-100 text-green-800" };

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Link href={`/area/${c.area}`} className="text-xl font-extrabold text-marca underline">
          {c.nombre}
        </Link>
        <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${estado.color}`}>{estado.texto}</span>
        <Link href={`/area/${c.area}/historial`} className="ml-auto text-base font-semibold text-marca underline">
          Historial
        </Link>
      </div>

      {enProceso.length === 0 && <p className="mt-2 text-gray-500">Nada en proceso.</p>}
      {enProceso.map((t) => {
        const atrasado = t.horasTranscurridas > t.horasEsperadas * 1.5 && t.horasTranscurridas - t.horasEsperadas > 1;
        return (
          <p key={`${t.tipo}-${t.id}`} className="mt-2 text-base">
            <b>{t.pedido}</b> con <b>{c.area === "almacen" ? `tela para ${t.cantidad} prendas` : t.titulo}</b>. Capacidad:{" "}
            {t.capacidadDia} por día, debe tomar {horasEnTexto(t.horasEsperadas)}.{" "}
            {t.estado === "detenido" ? (
              <b className="text-red-700">Detenido: {t.problema}.</b>
            ) : (
              <span className={atrasado ? "font-bold text-red-700" : ""}>
                Lleva {horasEnTexto(t.horasTranscurridas)}
                {atrasado ? ": ¿qué pasó?" : "."}
              </span>
            )}
          </p>
        );
      })}

      <p className="mt-2 border-t border-gray-200 pt-2 text-base text-gray-700">
        En cola: <b>{enCola.length}</b> {enCola.length === 1 ? "bloque" : "bloques"} ({prendasEnCola} prendas) · Se libera en{" "}
        <b>{c.dias > 0 ? horasEnTexto(c.dias * 8) : "ya está libre"}</b>
        {c.area !== "almacen" && (
          <>
            {" "}
            · Hoy salieron <b>{c.terminadasHoy}</b>
          </>
        )}
      </p>
    </article>
  );
}
