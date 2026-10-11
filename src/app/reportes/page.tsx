import Link from "next/link";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { GraficaColumnas } from "@/componentes/GraficaColumnas";
import { GraficaProduccion } from "@/componentes/GraficaProduccion";
import { exigir } from "@/lib/acceso";
import { ORDEN_AREAS, type AreaId } from "@/lib/catalogo";
import { diasHabilesEntre } from "@/lib/calendario";
import { fechaCorta, fechaHora, margenEnTexto } from "@/lib/formato";
import type { PedidoVista } from "@/lib/planta";
import { PERIODOS, cargarAnalisis, leerPeriodo, type Periodo } from "@/lib/reportes-datos";
import { BarrasApiladas, COLOR, Cifra, Figura, Leyenda, SinDatos, TablaDeCalor, horas } from "./Graficas";

type Filtros = { periodo?: string; area?: string; ver?: string };
type Props = { searchParams: Promise<Filtros> };

export default function PaginaReportes({ searchParams }: Props) {
  return (
    <>
      <Cabecera titulo="Análisis de producción" />
      <Suspense fallback={<Cargando />}>
        <Analisis searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// Filtro de la tabla de pedidos.
const VISTAS = {
  todos: "Todos",
  riesgo: "Llegarán tarde",
  justos: "Con poco margen",
  detenidos: "Detenidos",
  urgentes: "Urgentes",
} as const;
type Vista = keyof typeof VISTAS;

const SEMAFORO = {
  verde: { color: "bg-green-600", texto: "text-green-700" },
  amarillo: { color: "bg-amber-500", texto: "text-amber-700" },
  rojo: { color: "bg-red-600", texto: "text-red-700" },
};

const dias = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} ${Math.round(n * 10) === 10 ? "día" : "días"}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

async function Analisis({ searchParams }: Props) {
  await exigir("reportes");
  const sp = await searchParams;
  const periodo = leerPeriodo(sp.periodo);
  const area = ORDEN_AREAS.includes(sp.area as AreaId) ? (sp.area as AreaId) : null;
  const vista: Vista = sp.ver && sp.ver in VISTAS ? (sp.ver as Vista) : "todos";
  const { reporte: r, planta } = await cargarAnalisis(periodo);

  /** Enlace a esta misma pantalla cambiando solo algunos filtros. */
  const enlace = (cambio: { periodo?: Periodo; area?: AreaId | null; ver?: Vista }) => {
    const p = new URLSearchParams();
    const final = { periodo, area, ver: vista, ...cambio };
    if (final.periodo !== "30") p.set("periodo", final.periodo);
    if (final.area) p.set("area", final.area);
    if (final.ver !== "todos") p.set("ver", final.ver);
    const q = p.toString();
    return q ? `/reportes?${q}` : "/reportes";
  };
  const nombreDe = Object.fromEntries(r.areas.map((a) => [a.area, a.nombre])) as Record<AreaId, string>;
  const nombrePeriodo = `últimos ${PERIODOS[periodo].nombre}`;

  // ---------- Ahora ----------
  const flujo = planta.carga.map((c) => {
    const tarjetas = planta.tarjetas[c.area];
    const de = (estado: string) => tarjetas.filter((t) => t.estado === estado).reduce((n, t) => n + t.cantidad, 0);
    return { ...c, enProcesoPrendas: de("en_proceso"), enColaPrendas: de("en_cola"), detenidoPrendas: de("detenido") };
  });
  const prendasEnPlanta = flujo.reduce((n, f) => n + f.prendas, 0);
  const cuello = [...flujo].sort((a, b) => b.dias - a.dias)[0];
  const hayCuello = cuello.dias > 0;
  const activos = planta.pedidos.filter((p) => p.estado !== "listo");
  const tarde = activos.filter((p) => p.margenDias !== null && p.margenDias < 0).length;
  const detenidos = activos.filter((p) => p.detenido).length;
  const justos = activos.filter((p) => p.semaforo === "amarillo").length;

  // ---------- Periodo ----------
  const conFecha = r.entregas.filter((x) => x.aTiempo !== null);
  const aTiempo = conFecha.filter((x) => x.aTiempo).length;
  const reprogramados = conFecha.filter((x) => x.reprogramado).length;
  const sinRecoger = r.entregas.filter((x) => !x.entregado).length;
  const limita = r.capacidadPlanta ? nombreDe[r.capacidadPlanta.limita] : null;
  const tardeListos = conFecha.length - aTiempo;
  const listos = [...r.entregas].reverse();

  // Lo aceptado frente a lo que la planta puede hacer: días de trabajo que pide al área más cargada.
  const d = r.demanda;
  const razon = d && r.diasTrabajados > 0 ? d.diasNecesarios / r.diasTrabajados : null;
  const pendienteHoy = r.pendiente[r.pendiente.length - 1] ?? 0;
  const terminadas = r.produccion.acabados.reduce((n, v) => n + v, 0);
  const veredicto = razon === null ? null : razon >= 1.1 ? "Sí." : razon > 0.9 ? "Está al límite." : "No.";
  const areaProduccion = area ?? "acabados";
  const conTramos = r.areas.filter((a) => a.medidos > 0);
  const tramosVistos = r.tramos.filter((t) => !area || t.area === area);
  const pasados = tramosVistos
    .flatMap((t) => (t.horasReales !== null && t.horasReales > t.horasPlan ? [{ ...t, horasReales: t.horasReales }] : []))
    .sort((a, b) => b.horasReales - b.horasPlan - (a.horasReales - a.horasPlan))
    .slice(0, 8);
  const problemasVistos = r.problemas.filter((p) => !area || p.area === area);

  const pedidos = activos
    .filter((p) => !area || p.areas.includes(nombreDe[area]))
    .filter((p) =>
      vista === "riesgo"
        ? p.margenDias !== null && p.margenDias < 0
        : vista === "justos"
          ? p.semaforo === "amarillo"
          : vista === "detenidos"
            ? p.detenido
            : vista === "urgentes"
              ? p.urgente
              : true,
    )
    .sort((a, b) => (a.margenDias ?? 99) - (b.margenDias ?? 99));

  const titulo = "text-sm font-bold uppercase tracking-widest text-gray-500";
  const pastilla = (activa: boolean) =>
    `rounded-full px-4 py-1.5 text-base font-bold whitespace-nowrap ${activa ? "bg-marca text-white" : "bg-white text-marca shadow-sm hover:bg-gray-100"}`;

  return (
    <main className="flex-1 p-5 max-w-7xl w-full mx-auto space-y-8">
      {/* Filtros: una sola fila arriba; valen para toda la pantalla. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-gray-600">Periodo</span>
          {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
            <Link key={p} href={enlace({ periodo: p })} scroll={false} aria-current={p === periodo ? "true" : undefined} className={pastilla(p === periodo)}>
              {PERIODOS[p].nombre}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-gray-600">Área</span>
          <Link href={enlace({ area: null })} scroll={false} aria-current={!area ? "true" : undefined} className={pastilla(!area)}>
            Todas
          </Link>
          {ORDEN_AREAS.map((a) => (
            <Link key={a} href={enlace({ area: a })} scroll={false} aria-current={a === area ? "true" : undefined} className={pastilla(a === area)}>
              {nombreDe[a]}
            </Link>
          ))}
        </div>
        <a
          href={`/reportes/exportar?periodo=${periodo}`}
          className="ml-auto rounded-xl bg-green-700 px-5 py-2 text-lg font-bold text-white active:scale-95"
        >
          Descargar Excel
        </a>
      </div>

      {/* 1. Estado de la planta en este momento. */}
      <section className="space-y-3">
        <h2 className={titulo}>Ahora mismo</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra
            etiqueta="Prendas en planta"
            valor={prendasEnPlanta.toLocaleString("es-PE")}
            detalle={`en ${plural(activos.length, "pedido", "pedidos")} sin terminar`}
          />
          <Cifra
            etiqueta="Pedidos que llegarán tarde"
            valor={String(tarde)}
            detalle={
              [justos && `${justos} con poco margen`, detenidos && `${detenidos} detenidos`].filter(Boolean).join(" · ") ||
              "ninguno con poco margen ni detenido"
            }
            tono={tarde > 0 ? "alerta" : "bien"}
          />
          <Cifra
            etiqueta={`Pedidos listos a tiempo, ${nombrePeriodo}`}
            valor={conFecha.length ? `${Math.round((aTiempo / conFecha.length) * 100)} %` : "—"}
            detalle={
              conFecha.length
                ? [
                    `${aTiempo} de ${plural(conFecha.length, "pedido terminado", "pedidos terminados")}`,
                    reprogramados && plural(reprogramados, "reprogramado", "reprogramados"),
                    sinRecoger && `${sinRecoger} sin recoger`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "ningún pedido quedó listo en el periodo"
            }
            tono={conFecha.length === 0 ? "normal" : aTiempo === conFecha.length ? "bien" : "alerta"}
          />
          <Cifra
            etiqueta="Cuello de botella"
            valor={hayCuello ? cuello.nombre : "—"}
            detalle={hayCuello ? `${dias(cuello.dias)} de trabajo acumulado` : "ningún área tiene trabajo acumulado"}
            tono={hayCuello && cuello.dias >= 3 ? "alerta" : "normal"}
          />
        </div>

        <Figura
          pregunta="¿Dónde está acumulado el trabajo?"
          nota="Prendas que cada área tiene encima, en el orden en que recorren la planta. Toca un área para ver solo lo suyo."
        >
          {prendasEnPlanta === 0 ? (
            <SinDatos texto="No hay prendas en planta en este momento." />
          ) : (
            <>
              <BarrasApiladas
                colores={[COLOR.proceso, COLOR.espera, COLOR.detenido]}
                filas={flujo.map((f) => ({
                  clave: f.area,
                  nombre: f.nombre,
                  partes: [f.enProcesoPrendas, f.enColaPrendas, f.detenidoPrendas],
                  texto: f.prendas ? `${f.prendas.toLocaleString("es-PE")} prendas · ${dias(f.dias)} para vaciarse` : "sin trabajo",
                  marca: hayCuello && f.area === cuello.area ? "Cuello de botella" : undefined,
                  href: enlace({ area: f.area === area ? null : f.area }),
                  activa: f.area === area,
                }))}
              />
              <Leyenda
                items={[
                  { color: COLOR.proceso, nombre: "En proceso" },
                  { color: COLOR.espera, nombre: "En cola" },
                  { color: COLOR.detenido, nombre: "Detenido por un problema" },
                ]}
              />
            </>
          )}
        </Figura>
      </section>

      {/* 2. Qué pasó en el periodo. */}
      <section className="space-y-3">
        <h2 className={titulo}>Tendencia · {nombrePeriodo}</h2>
        <Figura
          pregunta="¿Se está aceptando más de lo que la planta puede producir?"
          nota="Prendas aceptadas que todavía no han salido de la planta, al cierre de cada periodo. Si sube, entra más trabajo del que sale."
        >
          {!d || razon === null ? (
            <SinDatos texto="No se aceptó ningún pedido en este periodo." />
          ) : (
            <>
              <p className="text-lg text-gray-900">
                <b className={razon >= 1.1 ? "text-red-700" : razon > 0.9 ? "text-amber-700" : "text-green-700"}>{veredicto}</b>{" "}
                Se aceptaron {plural(d.pedidos, "pedido", "pedidos")} con {d.prendas.toLocaleString("es-PE")} prendas, que
                piden <b>{dias(d.diasNecesarios)}</b> de trabajo a {nombreDe[d.limita]}, y el periodo tuvo{" "}
                <b>{dias(r.diasTrabajados)}</b>: se aceptó el <b>{Math.round(razon * 100)} %</b> de lo que la planta puede
                hacer. Salieron {terminadas.toLocaleString("es-PE")} prendas y lo pendiente pasó de{" "}
                {r.pendienteInicial.toLocaleString("es-PE")} a <b>{pendienteHoy.toLocaleString("es-PE")}</b>.
              </p>
              <div className="mt-3 max-w-5xl">
                <GraficaColumnas
                  descripcion={`Prendas pendientes de producir al cierre de cada ${r.unidad}`}
                  etiquetas={r.cubetas.map((c) => c.etiqueta)}
                  series={[{ nombre: "Prendas pendientes", color: COLOR.proceso, valores: r.pendiente }]}
                  notas={r.cubetas.map((_, i) => `Entraron ${r.aceptadas[i]} y salieron ${r.produccion.acabados[i]}`)}
                  unidad={`Prendas pendientes al cierre de cada ${r.unidad}`}
                  enteros
                />
              </div>
            </>
          )}
        </Figura>
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Figura
            pregunta={area ? `¿Cuánto produce ${nombreDe[area]}?` : "¿Cuánto está produciendo la planta?"}
            nota={
              area
                ? `Prendas que ${nombreDe[area]} terminó. La línea es lo que puede sacar por día con las prendas que trabajó.`
                : `Prendas terminadas, es decir, las que salieron de Acabados. La línea es lo que la planta puede sacar por día con esas prendas${limita ? `: la limita ${limita}` : ""}.`
            }
          >
            <GraficaProduccion reporte={r} area={areaProduccion} planta={!area} />
          </Figura>

          <Figura
            pregunta="¿Estamos cumpliendo las fechas prometidas?"
            nota="Pedidos que la planta dejó listos, frente a la primera fecha que se le prometió al cliente. Reprogramar no la cambia."
          >
            {conFecha.length === 0 ? (
              <SinDatos texto="Ningún pedido quedó listo en este periodo." />
            ) : (
              <>
                <p className="mb-3 text-lg text-gray-800">
                  <b>{plural(conFecha.length, "pedido quedó listo", "pedidos quedaron listos")}</b>: <b>{aTiempo}</b> a tiempo y{" "}
                  <b className={tardeListos ? "text-red-700" : ""}>{tardeListos}</b> tarde.
                </p>
                <GraficaColumnas
                  descripcion={`Pedidos que quedaron listos a tiempo y tarde por ${r.cumplimiento.unidad}`}
                  etiquetas={r.cumplimiento.etiquetas}
                  series={[
                    { nombre: "A tiempo", color: COLOR.bien, valores: r.cumplimiento.aTiempo },
                    { nombre: "Tarde", color: COLOR.mal, valores: r.cumplimiento.tarde },
                  ]}
                  unidad={`Pedidos por ${r.cumplimiento.unidad}`}
                  compacta
                  enteros
                />
              </>
            )}
          </Figura>
        </div>
      </section>

      {/* 3. Por qué: dónde se pierde el tiempo y qué falla. */}
      <section className="space-y-3">
        <h2 className={titulo}>Causas · {nombrePeriodo}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <Figura
            pregunta="¿Dónde se va el tiempo de un bloque?"
            nota="Promedio de horas de trabajo por bloque en cada área: lo que espera en cola, lo que se trabaja y lo que pasa detenido."
          >
            {conTramos.length === 0 ? (
              <SinDatos texto="Todavía no hay bloques con hora de inicio y de fin en este periodo." />
            ) : (
              <>
                <BarrasApiladas
                  textoAbajo
                  colores={[COLOR.espera, COLOR.proceso, COLOR.detenido]}
                  filas={conTramos.map((a) => {
                    const real = a.procesoMedio + a.detenidoMedio;
                    const plan = a.horasPlan / a.medidos;
                    const desvio = plan > 0 ? Math.round((real / plan - 1) * 100) : 0;
                    return {
                      clave: a.area,
                      nombre: a.nombre,
                      partes: [a.esperaMedia, a.procesoMedio, a.detenidoMedio],
                      texto: `${horas(a.esperaMedia)} espera · ${horas(real)} en el área (plan ${horas(plan)})`,
                      marca: desvio >= 20 ? `+${desvio} % sobre el plan` : undefined,
                      activa: a.area === area,
                    };
                  })}
                />
                <Leyenda
                  items={[
                    { color: COLOR.espera, nombre: "Esperando en cola" },
                    { color: COLOR.proceso, nombre: "En proceso" },
                    { color: COLOR.detenido, nombre: "Detenido" },
                  ]}
                />
              </>
            )}
          </Figura>

          <Figura pregunta="¿Qué falla y en qué área?" nota="Veces que cada área reportó cada problema. Más oscuro es más veces.">
            {r.problemas.length === 0 ? (
              <SinDatos texto="No se reportaron problemas en este periodo." />
            ) : (
              <>
                <TablaDeCalor
                  encabezado="Área"
                  columnas={r.motivos.map((m) => m.motivo)}
                  filas={r.areas.map((a) => ({ nombre: a.nombre, valores: r.problemasPorMotivo[a.area], activa: a.area === area }))}
                />
                <p className="mt-3 text-base text-gray-700">
                  {r.critica && (
                    <>
                      <b>{r.critica.nombre}</b> es el área crítica del periodo: {horas(r.critica.horasDeRetraso)} sobre lo
                      planificado y {plural(r.critica.problemas, "problema", "problemas")}.{" "}
                    </>
                  )}
                  Sumando las áreas, hubo {horas(r.areas.reduce((n, a) => n + a.horasDetenida, 0))} de trabajo con algo
                  detenido.
                </p>
              </>
            )}
          </Figura>
        </div>
      </section>

      {/* 4. Detalle: lo que las gráficas no pueden mostrar pedido por pedido. */}
      <section className="space-y-3">
        <h2 className={titulo}>Detalle{area ? ` · ${nombreDe[area]}` : ""}</h2>

        <Figura pregunta="¿Qué pedidos están en riesgo?" nota="Pedidos en planta, del que tiene menos margen al que tiene más.">
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(VISTAS) as Vista[]).map((v) => (
              <Link key={v} href={enlace({ ver: v })} scroll={false} aria-current={v === vista ? "true" : undefined} className={pastilla(v === vista)}>
                {VISTAS[v]}
              </Link>
            ))}
          </div>
          {pedidos.length === 0 ? (
            <SinDatos texto="Ningún pedido cumple con estos filtros." />
          ) : (
            <TablaPedidos pedidos={pedidos} />
          )}
        </Figura>

        <Figura
          pregunta="¿Qué pedidos quedaron listos y cuándo?"
          nota={`Los que la planta terminó en los ${nombrePeriodo}, del más reciente al más antiguo. La diferencia es en días de trabajo frente a la primera fecha prometida.`}
        >
          {listos.length === 0 ? (
            <SinDatos texto="Ningún pedido quedó listo en este periodo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base tabular-nums">
                <thead className="text-sm text-gray-600">
                  <tr>
                    <th className="py-1 pr-3 font-semibold">Pedido</th>
                    <th className="py-1 pr-3 font-semibold">Cliente</th>
                    <th className="py-1 pr-3 font-semibold">Prometido</th>
                    <th className="py-1 pr-3 font-semibold">Quedó listo</th>
                    <th className="py-1 pr-3 font-semibold">Diferencia</th>
                    <th className="py-1 font-semibold">Lo recibió el cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {listos.slice(0, 15).map((x) => {
                    const dif = x.prometido ? diasHabilesEntre(x.prometido, x.listo) : null;
                    return (
                      <tr key={x.pedido} className="border-t border-gray-200">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <Link href={`/pedido/${x.pedido}`} className="font-bold text-marca underline">
                            {x.pedido}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3">{x.cliente}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {fechaCorta(x.prometido)}
                          {x.reprogramado && <span className="text-gray-600"> · reprogramado</span>}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{fechaCorta(x.listo)}</td>
                        <td className={`py-1.5 pr-3 font-bold whitespace-nowrap ${dif !== null && dif > 0 ? "text-red-700" : "text-green-700"}`}>
                          {dif === null ? "—" : dif > 0 ? `${dias(dif)} tarde` : dif < 0 ? `${dias(-dif)} antes` : "en la fecha"}
                        </td>
                        <td className="py-1.5 whitespace-nowrap">{x.entregado ? fechaCorta(x.entregado) : "todavía no"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {listos.length > 15 && (
                <p className="mt-2 text-sm text-gray-600">Y {listos.length - 15} más: están todos en la hoja Entregas del Excel.</p>
              )}
            </div>
          )}
        </Figura>

        <div className="grid gap-4 xl:grid-cols-2">
          <Figura pregunta="¿Qué bloques se pasaron más de lo planificado?" nota="Los ocho con más horas de trabajo por encima del plan.">
            {pasados.length === 0 ? (
              <SinDatos texto="Ningún bloque se pasó de lo planificado en este periodo." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base tabular-nums">
                  <thead className="text-sm text-gray-600">
                    <tr>
                      <th className="py-1 pr-3 font-semibold">Pedido</th>
                      <th className="py-1 pr-3 font-semibold">Área</th>
                      <th className="py-1 pr-3 font-semibold">Prenda</th>
                      <th className="py-1 pr-3 text-right font-semibold">Plan</th>
                      <th className="py-1 pr-3 text-right font-semibold">Real</th>
                      <th className="py-1 text-right font-semibold">De más</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pasados.map((t, i) => (
                      <tr key={i} className="border-t border-gray-200">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <Link href={`/pedido/${t.pedido}`} className="font-bold text-marca underline">
                            {t.pedido}
                          </Link>
                          {t.bloque !== null && <span className="text-gray-600"> · b{t.bloque}</span>}
                        </td>
                        <td className="py-1.5 pr-3">{nombreDe[t.area]}</td>
                        <td className="py-1.5 pr-3">
                          {t.cantidad} × {t.prenda}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{horas(t.horasPlan)}</td>
                        <td className="py-1.5 pr-3 text-right">{horas(t.horasReales)}</td>
                        <td className="py-1.5 text-right font-bold text-red-700">+{horas(t.horasReales - t.horasPlan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Figura>

          <Figura pregunta="¿Cuáles fueron los últimos problemas?" nota="Los ocho más recientes, con lo que escribió el área.">
            {problemasVistos.length === 0 ? (
              <SinDatos texto="No se reportaron problemas en este periodo." />
            ) : (
              <ul className="divide-y divide-gray-200">
                {[...problemasVistos]
                  .reverse()
                  .slice(0, 8)
                  .map((p, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-3 py-2 text-base">
                      <span className="font-bold">{nombreDe[p.area]}</span>
                      <span className="flex-1">{p.detalle}</span>
                      <span className="text-gray-600">
                        <Link href={`/pedido/${p.pedido}`} className="font-bold text-marca underline">
                          {p.pedido}
                        </Link>{" "}
                        · {fechaHora(p.reportado)} ·{" "}
                        {p.resuelto ? `detenido ${horas(p.horasDetenido)}` : <b className="text-red-700">sin resolver</b>}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Figura>
        </div>
      </section>

      <p className="text-sm text-gray-500">
        Las horas son de trabajo: lunes a sábado, de 8:00 a 16:00. Cuando un área tiene varios bloques en proceso a la
        vez, el tiempo se reparte entre ellos. El periodo cuenta días completos, incluido hoy. Lo planificado sale de los minutos por prenda y la
        capacidad de Configuración. El Excel trae todas las áreas del periodo elegido, sin el filtro de área.
      </p>
    </main>
  );
}

function TablaPedidos({ pedidos }: { pedidos: PedidoVista[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base">
        <thead className="text-sm text-gray-600">
          <tr>
            <th className="py-1 pr-3 font-semibold">Pedido</th>
            <th className="py-1 pr-3 font-semibold">Cliente</th>
            <th className="py-1 pr-3 text-right font-semibold">Prendas</th>
            <th className="w-48 py-1 pr-3 font-semibold">Avance</th>
            <th className="py-1 pr-3 font-semibold">Dónde está</th>
            <th className="py-1 pr-3 font-semibold">Prometido</th>
            <th className="py-1 pr-3 font-semibold">Termina</th>
            <th className="py-1 font-semibold">Margen</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => {
            const s = SEMAFORO[p.semaforo];
            return (
              <tr key={p.id} className="border-t border-gray-200">
                <td className="py-2 pr-3 whitespace-nowrap">
                  <span className={`mr-2 inline-block h-3 w-3 rounded-full ${s.color}`} />
                  <Link href={`/pedido/${p.codigo}`} className="font-bold text-marca underline">
                    {p.codigo}
                  </Link>
                  {p.urgente && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">URGENTE</span>}
                </td>
                <td className="py-2 pr-3">{p.cliente}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{p.prendas}</td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: COLOR.pista }}>
                      <span className="block h-full rounded-full" style={{ width: `${p.avance}%`, background: COLOR.proceso }} />
                    </span>
                    <span className="w-10 text-right font-semibold tabular-nums">{p.avance}%</span>
                  </span>
                </td>
                <td className="py-2 pr-3">{p.areas.join(", ") || "—"}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{fechaCorta(p.fechaPrometida)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{fechaCorta(p.fechaEstimada)}</td>
                <td className={`py-2 font-bold whitespace-nowrap ${s.texto}`}>
                  {p.detenido ? "Detenido" : margenEnTexto(p.margenDias)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
