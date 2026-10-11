import Link from "next/link";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { exigir } from "@/lib/acceso";
import { fechaHora, horasEnTexto } from "@/lib/formato";
import { PERIODOS, cargarReporte, leerPeriodo, type Periodo } from "@/lib/reportes-datos";
import type { ResumenArea } from "@/lib/reportes";
import { Barras, BarrasConPlan, Figura, SinDatos, TablaDeCalor } from "./Graficas";

type Props = { searchParams: Promise<{ periodo?: string }> };

export default function PaginaReportes({ searchParams }: Props) {
  return (
    <>
      <Cabecera titulo="Reportes de producción" />
      <Suspense fallback={<Cargando />}>
        <Reportes searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(2, 4)}`;
const horas = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} h`;
const veces = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function mayor(areas: ResumenArea[], campo: "horasDeRetraso" | "problemas" | "horasDetenida"): ResumenArea | null {
  const a = [...areas].sort((x, y) => y[campo] - x[campo])[0];
  return a[campo] > 0 ? a : null;
}

async function Reportes({ searchParams }: Props) {
  await exigir("reportes");
  const periodo = leerPeriodo((await searchParams).periodo);
  const r = await cargarReporte(periodo);

  const conTramos = r.areas.filter((a) => a.tramos > 0);
  const totalProblemas = r.problemas.length;
  const abiertos = r.problemas.filter((p) => !p.resuelto).length;
  const masRetraso = mayor(r.areas, "horasDeRetraso");
  const masProblemas = mayor(r.areas, "problemas");
  const masDetenida = mayor(r.areas, "horasDetenida");
  const titulo = "text-xl font-bold text-gray-600 uppercase tracking-wide";

  return (
    <main className="flex-1 p-5 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
          <Link
            key={p}
            href={`/reportes?periodo=${p}`}
            aria-current={p === periodo ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-lg font-bold ${p === periodo ? "bg-marca text-white" : "bg-white text-marca shadow-sm"}`}
          >
            {PERIODOS[p].nombre}
          </Link>
        ))}
        <a
          href={`/reportes/exportar?periodo=${periodo}`}
          className="ml-auto rounded-xl bg-green-700 px-5 py-2 text-lg font-bold text-white active:scale-95"
        >
          Descargar Excel
        </a>
      </div>

      <section className="rounded-2xl border-l-[12px] border-red-600 bg-white p-5 shadow-sm">
        <h2 className={titulo}>Área crítica</h2>
        {r.critica ? (
          <>
            <p className="mt-1 text-4xl font-extrabold text-marca">{r.critica.nombre}</p>
            <p className="mt-1 text-xl text-gray-700">
              Acumuló <b>{horasEnTexto(r.critica.horasDeRetraso)}</b> de trabajo por encima de lo planificado en{" "}
              {veces(r.critica.tramos, "bloque", "bloques")}, con {veces(r.critica.problemas, "problema", "problemas")}{" "}
              reportados.
            </p>
          </>
        ) : (
          <p className="mt-1 text-xl text-gray-700">
            Ninguna: en este periodo ningún área se pasó de lo planificado ni reportó problemas.
          </p>
        )}
        <p className="mt-2 text-base text-gray-500">
          Es el área que más horas de trabajo sumó por encima de lo planificado; a igualdad, la que reportó más problemas.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra valor={masRetraso?.nombre ?? "—"} texto="se retrasa más" detalle={masRetraso && `${horas(masRetraso.horasDeRetraso)} de más`} />
        <Cifra valor={masProblemas?.nombre ?? "—"} texto="reporta más problemas" detalle={masProblemas && veces(masProblemas.problemas, "problema", "problemas")} />
        <Cifra valor={masDetenida?.nombre ?? "—"} texto="pasa más tiempo detenida" detalle={masDetenida && horas(masDetenida.horasDetenida)} />
        <Cifra valor={String(totalProblemas)} texto="problemas en el periodo" detalle={abiertos ? `${abiertos} sin resolver` : null} />
      </section>

      <Figura
        titulo="Tiempo real frente al planificado, por área"
        nota="Horas de trabajo de los bloques terminados en el periodo. Si la barra pasa la marca gris, el área tardó más de lo planificado."
      >
        {conTramos.length === 0 ? (
          <SinDatos texto="Todavía no hay bloques terminados en este periodo." />
        ) : (
          <BarrasConPlan
            filas={conTramos.map((a) => {
              const diferencia = a.horasPlan > 0 ? Math.round((a.horasReales / a.horasPlan - 1) * 100) : 0;
              return {
                nombre: a.nombre,
                real: a.horasReales,
                plan: a.horasPlan,
                texto: `${horas(a.horasReales)} reales · ${horas(a.horasPlan)} planificadas (${diferencia > 0 ? "+" : ""}${diferencia} %) · ${a.retrasados} de ${a.tramos} bloques con retraso`,
              };
            })}
          />
        )}
      </Figura>

      <div className="grid gap-6 lg:grid-cols-2">
        <Figura titulo="Problemas reportados por área" nota="Veces que el área tocó PROBLEMA en el periodo.">
          {totalProblemas === 0 ? (
            <SinDatos texto="No se reportaron problemas en este periodo." />
          ) : (
            <Barras filas={r.areas.map((a) => ({ nombre: a.nombre, valor: a.problemas, texto: String(a.problemas) }))} />
          )}
        </Figura>

        <Figura titulo="Horas detenidas por área" nota="Horas de trabajo entre que se reporta un problema y se marca como resuelto.">
          {totalProblemas === 0 ? (
            <SinDatos texto="Ningún área estuvo detenida en este periodo." />
          ) : (
            <Barras filas={r.areas.map((a) => ({ nombre: a.nombre, valor: a.horasDetenida, texto: horas(a.horasDetenida) }))} />
          )}
        </Figura>
      </div>

      <Figura titulo="Problemas por área y por mes" nota="Cantidad de problemas reportados. Más oscuro es más problemas.">
        <TablaDeCalor
          columnas={r.meses.map(nombreMes)}
          filas={r.areas.map((a) => ({ nombre: a.nombre, valores: r.problemasPorMes[a.area] }))}
        />
      </Figura>

      <Figura titulo="Qué problemas se repiten" nota="Motivo elegido al reportar. Las descripciones de “Otro problema” están en la lista de abajo y en el Excel.">
        {r.motivos.length === 0 ? (
          <SinDatos texto="No se reportaron problemas en este periodo." />
        ) : (
          <Barras filas={r.motivos.map((m) => ({ nombre: m.motivo, valor: m.veces, texto: String(m.veces) }))} />
        )}
      </Figura>

      {totalProblemas > 0 && (
        <section className="space-y-3">
          <h2 className={titulo}>Últimos problemas</h2>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left text-lg">
              <thead className="text-base text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">Cuándo</th>
                  <th className="px-4 py-2 font-semibold">Área</th>
                  <th className="px-4 py-2 font-semibold">Pedido</th>
                  <th className="px-4 py-2 font-semibold">Problema</th>
                  <th className="px-4 py-2 font-semibold">Detenido</th>
                </tr>
              </thead>
              <tbody>
                {[...r.problemas]
                  .reverse()
                  .slice(0, 15)
                  .map((p, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="px-4 py-2 whitespace-nowrap">{fechaHora(p.reportado)}</td>
                      <td className="px-4 py-2 font-semibold">{r.areas.find((a) => a.area === p.area)!.nombre}</td>
                      <td className="px-4 py-2">
                        <Link href={`/pedido/${p.pedido}`} className="font-bold text-marca underline">
                          {p.pedido}
                        </Link>
                        {p.bloque !== null && ` · bloque ${p.bloque}`}
                      </td>
                      <td className="px-4 py-2">{p.detalle}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {horas(p.horasDetenido)}
                        {!p.resuelto && <b className="text-red-700"> · sin resolver</b>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Cifra({ valor, texto, detalle }: { valor: string; texto: string; detalle: string | null }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-2xl font-extrabold text-marca">{valor}</p>
      <p className="text-base text-gray-700">{texto}</p>
      {detalle && <p className="text-base font-semibold text-gray-900">{detalle}</p>}
    </div>
  );
}
