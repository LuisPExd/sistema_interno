import Link from "next/link";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { GraficaColumnas } from "@/componentes/GraficaColumnas";
import { GraficaProduccion } from "@/componentes/GraficaProduccion";
import { exigir } from "@/lib/acceso";
import { ORDEN_AREAS, type AreaId } from "@/lib/catalogo";
import { HORAS_POR_DIA, diasHabilesEntre } from "@/lib/calendario";
import { fechaCorta, margenEnTexto } from "@/lib/formato";
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
    // El largo de la barra son días de trabajo: en prendas, 300 en Corte y 300 en Confección parecerían lo mismo.
    const de = (estado: string) =>
      tarjetas.filter((t) => t.estado === estado).reduce((n, t) => n + t.horasEsperadas, 0) / HORAS_POR_DIA;
    return { ...c, partes: [de("en_proceso"), de("en_cola"), de("detenido")] };
  });
  const prendasEnPlanta = flujo.reduce((n, f) => n + f.prendas, 0);
  const cuello = [...flujo].sort((a, b) => b.dias - a.dias)[0];
  const hayCuello = cuello.dias > 0;
  const activos = planta.pedidos.filter((p) => p.estado !== "listo");
  const tarde = activos.filter((p) => p.margenDias !== null && p.margenDias < 0).length;
  const detenidos = activos.filter((p) => p.detenido).length;
  const justos = activos.filter((p) => p.semaforo === "amarillo").length;

  // Qué tipo de prenda tiene cada área en este momento.
  const enPlanta = new Map<string, number[]>();
  ORDEN_AREAS.forEach((a, i) => {
    for (const t of planta.tarjetas[a]) {
      for (const x of t.prendas) {
        if (!enPlanta.has(x.nombre)) enPlanta.set(x.nombre, ORDEN_AREAS.map(() => 0));
        enPlanta.get(x.nombre)![i] += x.cantidad;
      }
    }
  });
  const suma = (v: number[]) => v.reduce((n, x) => n + x, 0);
  const prendasPorArea = [...enPlanta].sort((a, b) => suma(b[1]) - suma(a[1]));

  // ---------- Periodo ----------
  const conFecha = r.entregas.filter((x) => x.aTiempo !== null);
  const aTiempo = conFecha.filter((x) => x.aTiempo).length;
  const listos = [...r.entregas].reverse();
  // Lo aceptado frente a lo que la planta puede hacer: días de trabajo que pide al área más cargada.
  const d = r.demanda;
  const razon = d && r.diasTrabajados > 0 ? d.diasNecesarios / r.diasTrabajados : null;
  const s = r.porSemana;
  // La capacidad de una semana (o mes) completa; las incompletas del borde quedan por debajo.
  const capacidadGrupo = r.capacidadPlanta ? r.capacidadPlanta.prendasDia * Math.max(...s.diasHabiles, 0) : 0;
  const areaProduccion = area ?? "acabados";
  const conTramos = r.areas.filter((a) => a.medidos > 0);
  const pasados = [...r.tramos, ...r.enCurso]
    .filter((t) => !area || t.area === area)
    .flatMap((t) => (t.horasReales !== null && t.horasReales > t.horasPlan ? [{ ...t, horasReales: t.horasReales }] : []))
    .sort((a, b) => b.horasReales - b.horasPlan - (a.horasReales - a.horasPlan))
    .slice(0, 10);
  const tope = Math.max(...r.porPrenda.map((x) => Math.max(x.aceptadas, x.terminadas)), 0);

  const orden = { rojo: 0, amarillo: 1, verde: 2 };
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
    .sort((a, b) => orden[a.semaforo] - orden[b.semaforo] || (a.margenDias ?? 99) - (b.margenDias ?? 99));

  const titulo = "text-sm font-bold uppercase tracking-widest text-gray-500";
  const pastilla = (activa: boolean) =>
    `rounded-full px-4 py-1.5 text-base font-bold whitespace-nowrap ${activa ? "bg-marca text-white" : "bg-white text-marca shadow-sm hover:bg-gray-100"}`;
  const th = "py-1 pr-3 font-semibold";

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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Cifra
            etiqueta="Prendas en planta"
            valor={prendasEnPlanta.toLocaleString("es-PE")}
            detalle={`en ${plural(activos.length, "pedido", "pedidos")}`}
          />
          <Cifra
            etiqueta="Pedidos que llegarán tarde"
            valor={String(tarde)}
            detalle={`${justos} con poco margen · ${detenidos} detenidos`}
            tono={tarde > 0 ? "alerta" : "bien"}
          />
          <Cifra
            etiqueta="Cuello de botella"
            valor={hayCuello ? cuello.nombre : "—"}
            detalle={hayCuello ? `${dias(cuello.dias)} de trabajo acumulado` : "sin trabajo acumulado"}
            tono={hayCuello && cuello.dias >= 3 ? "alerta" : "normal"}
          />
          <Cifra
            etiqueta={`Aceptado frente a capacidad, ${PERIODOS[periodo].nombre}`}
            valor={razon === null ? "—" : `${Math.round(razon * 100)} %`}
            detalle={d && razon !== null ? `${dias(d.diasNecesarios)} de ${nombreDe[d.limita]} en ${dias(r.diasTrabajados)}` : "sin pedidos aceptados"}
            tono={razon === null ? "normal" : razon >= 1.1 ? "alerta" : razon <= 0.9 ? "bien" : "normal"}
          />
          <Cifra
            etiqueta={`Pedidos listos a tiempo, ${PERIODOS[periodo].nombre}`}
            valor={conFecha.length ? `${Math.round((aTiempo / conFecha.length) * 100)} %` : "—"}
            detalle={conFecha.length ? `${aTiempo} de ${conFecha.length}` : "ninguno quedó listo"}
            tono={conFecha.length === 0 ? "normal" : aTiempo === conFecha.length ? "bien" : "alerta"}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
          <Figura titulo="Trabajo acumulado por área" nota="Días de trabajo que cada área tiene encima.">
            {prendasEnPlanta === 0 ? (
              <SinDatos texto="No hay prendas en planta." />
            ) : (
              <>
                <BarrasApiladas
                  textoAbajo
                  colores={[COLOR.proceso, COLOR.espera, COLOR.detenido]}
                  filas={flujo.map((f) => ({
                    clave: f.area,
                    nombre: f.nombre,
                    partes: f.partes,
                    texto: f.prendas ? `${dias(f.dias)} · ${f.prendas.toLocaleString("es-PE")} prendas` : "sin trabajo",
                    marca: hayCuello && f.area === cuello.area ? "Cuello de botella" : undefined,
                    href: enlace({ area: f.area === area ? null : f.area }),
                    activa: f.area === area,
                  }))}
                />
                <Leyenda
                  items={[
                    { color: COLOR.proceso, nombre: "En proceso" },
                    { color: COLOR.espera, nombre: "En cola" },
                    { color: COLOR.detenido, nombre: "Detenido" },
                  ]}
                />
              </>
            )}
          </Figura>

          <Figura titulo="Prendas en planta por tipo y área" nota="Qué se está fabricando y dónde está.">
            {prendasPorArea.length === 0 ? (
              <SinDatos texto="No hay prendas en planta." />
            ) : (
              <TablaDeCalor
                encabezado="Prenda"
                columnas={ORDEN_AREAS.map((a) => nombreDe[a])}
                filas={prendasPorArea.map(([nombre, valores]) => ({ nombre, valores }))}
              />
            )}
          </Figura>
        </div>
      </section>

      {/* 2. Qué pasó en el periodo. */}
      <section className="space-y-3">
        <h2 className={titulo}>Tendencia · {nombrePeriodo}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <Figura titulo="Prendas aceptadas y terminadas" nota={`Total por ${s.unidad}, frente a lo que la planta puede producir.`}>
            {suma(s.aceptadas) + suma(s.terminadas) === 0 ? (
              <SinDatos texto="Sin pedidos aceptados ni prendas terminadas en este periodo." />
            ) : (
              <GraficaColumnas
                descripcion={`Prendas aceptadas y terminadas por ${s.unidad}`}
                etiquetas={s.etiquetas}
                agrupadas
                series={[
                  { nombre: "Aceptadas", color: COLOR.espera, valores: s.aceptadas },
                  { nombre: "Terminadas", color: COLOR.proceso, valores: s.terminadas },
                ]}
                notas={s.diasHabiles.map((n) => plural(n, "día trabajado", "días trabajados"))}
                referencia={capacidadGrupo ? { valor: capacidadGrupo, texto: `Capacidad: ${capacidadGrupo} por ${s.unidad}` } : undefined}
                unidad={`Prendas por ${s.unidad}`}
                enteros
                compacta
              />
            )}
          </Figura>

          <Figura titulo="Prendas pendientes de producir" nota={`Aceptadas que no han salido de la planta, al cierre de cada ${r.unidad}.`}>
            {suma(r.pendiente) === 0 ? (
              <SinDatos texto="No hubo prendas pendientes en este periodo." />
            ) : (
              <GraficaColumnas
                descripcion={`Prendas pendientes de producir al cierre de cada ${r.unidad}`}
                etiquetas={r.cubetas.map((c) => c.etiqueta)}
                series={[{ nombre: "Pendientes", color: COLOR.proceso, valores: r.pendiente }]}
                notas={r.cubetas.map((_, i) => `Entraron ${r.aceptadas[i]} y salieron ${r.produccion.acabados[i]}`)}
                unidad="Prendas"
                compacta
                enteros
              />
            )}
          </Figura>

          <Figura
            titulo={area ? `Prendas terminadas en ${nombreDe[area]}` : "Prendas terminadas"}
            nota={area ? "Frente a lo que el área puede sacar por día." : "Lo que sale de Acabados, frente a la capacidad de la planta."}
          >
            <GraficaProduccion reporte={r} area={areaProduccion} planta={!area} />
          </Figura>

          <Figura titulo="Pedidos listos a tiempo y tarde" nota="Frente a la primera fecha prometida al cliente.">
            {conFecha.length === 0 ? (
              <SinDatos texto="Ningún pedido quedó listo en este periodo." />
            ) : (
              <GraficaColumnas
                descripcion={`Pedidos que quedaron listos a tiempo y tarde por ${s.unidad}`}
                etiquetas={s.etiquetas}
                series={[
                  { nombre: "A tiempo", color: COLOR.bien, valores: s.aTiempo },
                  { nombre: "Tarde", color: COLOR.mal, valores: s.tarde },
                ]}
                unidad={`Pedidos por ${s.unidad}`}
                compacta
                enteros
              />
            )}
          </Figura>
        </div>

        <Figura titulo="Producción por tipo de prenda" nota="Prendas terminadas en el periodo; al lado, las aceptadas.">
          {r.porPrenda.length === 0 ? (
            <SinDatos texto="Sin pedidos aceptados ni prendas terminadas en este periodo." />
          ) : (
            <BarrasApiladas
              ancha
              tope={tope}
              colores={[COLOR.proceso]}
              filas={r.porPrenda.slice(0, 12).map((x) => ({
                clave: x.prenda,
                nombre: x.prenda,
                partes: [x.terminadas],
                texto: `${x.terminadas.toLocaleString("es-PE")} terminadas · ${x.aceptadas.toLocaleString("es-PE")} aceptadas`,
              }))}
            />
          )}
        </Figura>
      </section>

      {/* 3. Dónde se pierde el tiempo y qué falla. */}
      <section className="space-y-3">
        <h2 className={titulo}>Causas · {nombrePeriodo}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <Figura titulo="Horas por bloque en cada área" nota="Promedio por bloque, en horas de trabajo.">
            {conTramos.length === 0 ? (
              <SinDatos texto="Todavía no hay bloques con hora de inicio y de fin en este periodo." />
            ) : (
              <>
                <BarrasApiladas
                  textoAbajo
                  colores={[COLOR.espera, COLOR.proceso, COLOR.detenido]}
                  filas={conTramos.map((a) => {
                    const desvio = Math.round((a.desviacion ?? 0) * 100);
                    const critica = r.critica?.area === a.area;
                    return {
                      clave: a.area,
                      nombre: a.nombre,
                      partes: [a.esperaMedia, a.procesoMedio, a.detenidoMedio],
                      texto: `Espera ${horas(a.esperaMedia)} · en el área ${horas(a.procesoMedio + a.detenidoMedio)} · plan ${horas(a.horasPlan / a.medidos)}`,
                      marca: critica ? `Área crítica · +${desvio} %` : desvio >= 20 ? `+${desvio} % sobre el plan` : undefined,
                      activa: a.area === area,
                    };
                  })}
                />
                <Leyenda
                  items={[
                    { color: COLOR.espera, nombre: "En cola" },
                    { color: COLOR.proceso, nombre: "En proceso" },
                    { color: COLOR.detenido, nombre: "Detenido" },
                  ]}
                />
              </>
            )}
          </Figura>

          <Figura titulo="Problemas por área y motivo" nota="Veces que se reportó cada problema.">
            {r.problemas.length === 0 ? (
              <SinDatos texto="No se reportaron problemas en este periodo." />
            ) : (
              <TablaDeCalor
                encabezado="Área"
                columnas={r.motivos.map((m) => m.motivo)}
                filas={r.areas.map((a) => ({ nombre: a.nombre, valores: r.problemasPorMotivo[a.area], activa: a.area === area }))}
              />
            )}
          </Figura>
        </div>
      </section>

      {/* 4. Detalle pedido por pedido. */}
      <section className="space-y-3">
        <h2 className={titulo}>Detalle{area ? ` · ${nombreDe[area]}` : ""}</h2>

        <Figura titulo="Pedidos en planta">
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(VISTAS) as Vista[]).map((v) => (
              <Link key={v} href={enlace({ ver: v })} scroll={false} aria-current={v === vista ? "true" : undefined} className={pastilla(v === vista)}>
                {VISTAS[v]}
              </Link>
            ))}
          </div>
          {pedidos.length === 0 ? <SinDatos texto="Ningún pedido cumple con estos filtros." /> : <TablaPedidos pedidos={pedidos} />}
        </Figura>

        <Figura titulo={`Pedidos terminados, ${nombrePeriodo}`}>
          {listos.length === 0 ? (
            <SinDatos texto="Ningún pedido quedó listo en este periodo." />
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left text-base tabular-nums">
                <thead className="text-sm text-gray-600">
                  <tr>
                    <th className={th}>Pedido</th>
                    <th className={th}>Prendas</th>
                    <th className={th}>Cliente</th>
                    <th className={th}>Prometido</th>
                    <th className={th}>Quedó listo</th>
                    <th className={th}>Diferencia</th>
                    <th className="py-1 font-semibold">Lo recibió el cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {listos.map((x) => {
                    const dif = x.prometido ? diasHabilesEntre(x.prometido, x.listo) : null;
                    return (
                      <tr key={x.pedido} className="border-t border-gray-200">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <Link href={`/pedido/${x.pedido}`} className="font-bold text-marca underline">
                            {x.pedido}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3">{x.detalle}</td>
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
            </div>
          )}
        </Figura>

        <Figura titulo="Bloques por encima de lo planificado" nota="Los diez con más horas de trabajo de más.">
          {pasados.length === 0 ? (
            <SinDatos texto="Ningún bloque se pasó de lo planificado en este periodo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base tabular-nums">
                <thead className="text-sm text-gray-600">
                  <tr>
                    <th className={th}>Pedido</th>
                    <th className={th}>Área</th>
                    <th className={th}>Prenda</th>
                    <th className={`${th} text-right`}>Plan</th>
                    <th className={`${th} text-right`}>Real</th>
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
                        {t.enCurso && <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">EN PROCESO</span>}
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
      </section>

      <p className="text-sm text-gray-500">Horas de trabajo: lunes a sábado, de 8:00 a 16:00.</p>
    </main>
  );
}

function TablaPedidos({ pedidos }: { pedidos: PedidoVista[] }) {
  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-full text-left text-base">
        <thead className="text-sm text-gray-600">
          <tr>
            <th className="py-1 pr-3 font-semibold">Pedido</th>
            <th className="py-1 pr-3 font-semibold">Prendas</th>
            <th className="py-1 pr-3 font-semibold">Cliente</th>
            <th className="w-40 py-1 pr-3 font-semibold">Avance</th>
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
                <td className="py-2 pr-3">{p.resumen}</td>
                <td className="py-2 pr-3">{p.cliente}</td>
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
