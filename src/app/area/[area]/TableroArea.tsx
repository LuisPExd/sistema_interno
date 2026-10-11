"use client";

import { useOptimistic, useState, useTransition } from "react";
import { empezar, reportarProblema, resolverProblema, terminar } from "@/app/acciones";
import { fechaCorta, horasEnTexto } from "@/lib/formato";
import type { Tarjeta } from "@/lib/planta";

const MOTIVOS = [
  { texto: "Máquina malograda", icono: "🛠️" },
  { texto: "Falta material", icono: "🧵" },
  { texto: "Falta personal", icono: "👤" },
  { texto: "Otro problema", icono: "❓" },
];

const OTRO = "Otro problema";
const MAX_DESCRIPCION = 150;

// Cada toque que mueve un bloque se confirma antes de guardarse.
const CONFIRMAR = {
  empezar: {
    pregunta: "¿Seguro que quieres empezar?",
    efecto: "El bloque pasa a estar en proceso y empieza a contar el tiempo.",
    si: "SÍ, EMPEZAR",
    color: "bg-marca",
  },
  terminar: {
    pregunta: "¿Seguro que terminó el proceso?",
    efecto: "El bloque sale de esta área y pasa a la siguiente. No se puede deshacer.",
    si: "SÍ, TERMINÓ",
    color: "bg-green-600",
  },
  resolver: {
    pregunta: "¿Estás seguro de que ya se resolvió?",
    efecto: "El bloque vuelve a estar en proceso.",
    si: "SÍ, YA SE RESOLVIÓ",
    color: "bg-marca",
  },
};

type Cambio = { t: Tarjeta; estado: Tarjeta["estado"] | "fuera"; problema?: string };

export function TableroArea({ area, tarjetas: reales }: { area: string; tarjetas: Tarjeta[] }) {
  // Un área no empieza otro bloque si ya tiene en proceso el trabajo de un día (HANDOFF B9).
  const HORAS_DIA = 8;
  const [, iniciar] = useTransition();
  const [conProblema, setConProblema] = useState<Tarjeta | null>(null);
  // El problema se elige y luego se confirma, para no detener un bloque por un toque equivocado.
  const [porConfirmar, setPorConfirmar] = useState<{ t: Tarjeta; que: keyof typeof CONFIRMAR } | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  // Imágenes del modelo que se están mirando en grande.
  const [modelo, setModelo] = useState<Tarjeta | null>(null);
  const cerrarProblema = () => {
    setConProblema(null);
    setMotivo(null);
    setDescripcion("");
  };
  const faltaDescripcion = motivo === OTRO && descripcion.trim().length < 3;
  const reportar = () => {
    if (!conProblema || !motivo || faltaDescripcion) return;
    const t = conProblema;
    const texto = motivo === OTRO ? `${OTRO}: ${descripcion.trim()}` : motivo;
    cerrarProblema();
    hacer({ t, estado: "detenido", problema: texto }, () => reportarProblema(area, objetivo(t), texto));
  };

  // El toque se refleja al instante; cuando el servidor responde, mandan sus datos.
  const [tarjetas, adelantar] = useOptimistic(reales, (lista, c: Cambio) =>
    c.estado === "fuera"
      ? lista.filter((x) => !(x.tipo === c.t.tipo && x.id === c.t.id))
      : lista.map((x) =>
          x.tipo === c.t.tipo && x.id === c.t.id
            ? { ...x, estado: c.estado as Tarjeta["estado"], problema: c.problema ?? x.problema }
            : x,
        ),
  );
  const hacer = (c: Cambio, accion: () => Promise<void>) =>
    iniciar(async () => {
      adelantar(c);
      await accion();
    });

  const enProceso = tarjetas.filter((t) => t.estado !== "en_cola");
  const [siguiente, ...enCola] = tarjetas.filter((t) => t.estado === "en_cola");
  const horasEnProceso = enProceso.reduce((n, t) => n + t.horasEsperadas, 0);
  const llena = horasEnProceso >= HORAS_DIA - 1e-9;
  const horasTotales = tarjetas.reduce((n, t) => n + t.horasEsperadas, 0);
  const prendasEnProceso = enProceso.reduce((n, t) => n + t.cantidad, 0);

  const objetivo = (t: Tarjeta) => ({ tipo: t.tipo, id: t.id, pedidoId: t.pedidoId });
  const confirmar = () => {
    if (!porConfirmar) return;
    const { t, que } = porConfirmar;
    setPorConfirmar(null);
    if (que === "terminar") hacer({ t, estado: "fuera" }, () => terminar(area, objetivo(t)));
    else if (que === "empezar") hacer({ t, estado: "en_proceso" }, () => empezar(area, objetivo(t)));
    else hacer({ t, estado: "en_proceso" }, () => resolverProblema(area, objetivo(t)));
  };
  const boton =
    "rounded-2xl px-4 py-4 text-xl font-extrabold text-white shadow active:scale-95 disabled:opacity-50 transition sm:px-6 sm:py-5 sm:text-2xl";

  return (
    <main className="flex-1 p-3 sm:p-5 grid gap-4 sm:gap-6 lg:grid-cols-[3fr_2fr] content-start">
      <section className="lg:col-span-2 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 text-lg sm:text-xl">
          <span>
            En proceso: <b>{prendasEnProceso} prendas</b>
          </span>
          <span>
            Capacidad usada: <b>{Math.min(100, Math.round((horasEnProceso / HORAS_DIA) * 100))}%</b>
          </span>
          <span>
            Con lo que hay en cola, el área se libera en <b>{horasEnTexto(horasTotales)}</b>
          </span>
        </div>
        <div className="mt-2 h-4 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full ${llena ? "bg-amber-500" : "bg-green-600"}`}
            style={{ width: `${Math.min(100, (horasEnProceso / HORAS_DIA) * 100)}%` }}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-600 uppercase tracking-wide">En proceso</h2>
        {enProceso.length === 0 && (
          <p className="rounded-2xl bg-white p-5 text-center text-xl text-gray-500 sm:p-8 sm:text-2xl">
            No hay nada en proceso. Toca EMPEZAR en el siguiente.
          </p>
        )}
        {enProceso.map((t) => (
          <article
            key={`${t.tipo}-${t.id}`}
            className={`rounded-2xl bg-white p-4 shadow border-l-8 sm:p-5 sm:border-l-[12px] ${
              t.estado === "detenido" ? "border-red-600" : "border-green-600"
            }`}
          >
            <Contenido t={t} grande verModelo={setModelo} />
            {t.estado === "detenido" ? (
              <div className="mt-4 rounded-xl bg-red-50 p-4">
                <p className="text-xl font-bold text-red-700 sm:text-2xl">Detenido: {t.problema ?? "problema"}</p>
                <button
                  onClick={() => setPorConfirmar({ t, que: "resolver" })}
                  className={`${boton} mt-3 w-full bg-marca`}
                >
                  YA SE RESOLVIÓ
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr]">
                <button
                  onClick={() => setPorConfirmar({ t, que: "terminar" })}
                  className={`${boton} bg-green-600`}
                >
                  ✓ TERMINADO
                </button>
                <button onClick={() => setConProblema(t)} className={`${boton} bg-red-600`}>
                  PROBLEMA
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-600 uppercase tracking-wide">Siguiente</h2>
        {siguiente ? (
          <article className="rounded-2xl bg-white p-4 shadow border-l-8 border-acento sm:p-5 sm:border-l-[12px]">
            <Contenido t={siguiente} grande verModelo={setModelo} />
            {llena ? (
              <p className="mt-4 rounded-2xl bg-amber-100 p-4 text-center text-lg font-bold text-amber-900 sm:text-xl">
                El área está a su capacidad. Termina un bloque para empezar este.
              </p>
            ) : (
              <button
                onClick={() => setPorConfirmar({ t: siguiente, que: "empezar" })}
                className={`${boton} mt-4 w-full bg-marca`}
              >
                ▶ EMPEZAR
              </button>
            )}
          </article>
        ) : (
          <p className="rounded-2xl bg-white p-5 text-center text-xl text-gray-500 sm:p-8 sm:text-2xl">No hay nada en cola.</p>
        )}

        {enCola.length > 0 && (
          <>
            <h2 className="pt-2 text-xl font-bold text-gray-600 uppercase tracking-wide">
              En cola ({enCola.length})
            </h2>
            {enCola.map((t) => (
              <article key={`${t.tipo}-${t.id}`} className="rounded-2xl bg-white p-4 shadow-sm">
                <Contenido t={t} verModelo={setModelo} />
              </article>
            ))}
          </>
        )}
      </section>

      {porConfirmar && (
        <div className="fixed inset-0 z-10 bg-black/60 p-3 flex items-center justify-center sm:p-6">
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-4 sm:p-6">
            <h2 className="text-2xl font-extrabold sm:text-3xl">{CONFIRMAR[porConfirmar.que].pregunta}</h2>
            <p className="mt-3 text-xl font-bold text-marca sm:text-2xl">{porConfirmar.t.pedido}</p>
            <p className="text-xl font-bold sm:text-2xl">{porConfirmar.t.titulo}</p>
            <p className="text-xl text-gray-600">{porConfirmar.t.cantidad} prendas</p>
            {porConfirmar.que === "resolver" && (
              <p className="mt-4 rounded-2xl bg-red-50 p-4 text-xl font-bold text-red-700 sm:p-5 sm:text-2xl">
                {porConfirmar.t.problema ?? "Problema"}
              </p>
            )}
            <p className="mt-3 text-lg text-gray-600 sm:text-xl">{CONFIRMAR[porConfirmar.que].efecto}</p>
            <div className="mt-5 grid grid-cols-[1fr_2fr] gap-3">
              <button onClick={() => setPorConfirmar(null)} className="rounded-2xl bg-gray-200 py-4 text-xl font-bold sm:py-5 sm:text-2xl">
                No
              </button>
              <button onClick={confirmar} className={`${boton} ${CONFIRMAR[porConfirmar.que].color}`}>
                {CONFIRMAR[porConfirmar.que].si}
              </button>
            </div>
          </div>
        </div>
      )}

      {modelo && (
        <div className="fixed inset-0 z-10 bg-black/70 p-3 flex items-center justify-center sm:p-6" onClick={() => setModelo(null)}>
          <div className="flex max-h-full w-full max-w-5xl flex-col rounded-3xl bg-white p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-extrabold sm:text-3xl">Modelo · {modelo.pedido}</h2>
                <p className="text-lg text-gray-600 sm:text-xl">{modelo.titulo}</p>
              </div>
              <button onClick={() => setModelo(null)} className="rounded-2xl bg-gray-200 px-5 py-3 text-xl font-bold active:scale-95">
                Cerrar
              </button>
            </div>
            <div className="mt-4 flex flex-1 gap-3 overflow-auto">
              {modelo.modelos.map((url, i) => (
                // Enlace temporal a un archivo privado: no pasa por el optimizador de imágenes.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt={`Modelo, vista ${i + 1}`} className="max-h-[65vh] min-w-0 flex-1 rounded-xl border-2 border-gray-200 object-contain" />
              ))}
            </div>
          </div>
        </div>
      )}

      {conProblema && (
        <div className="fixed inset-0 z-10 bg-black/60 p-3 flex items-center justify-center sm:p-6">
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-4 sm:p-6">
            <h2 className="text-2xl font-extrabold sm:text-3xl">¿Qué pasó?</h2>
            <p className="mt-1 text-lg text-gray-600 sm:text-xl">
              {conProblema.pedido} · {conProblema.titulo}
            </p>
            {motivo === null ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-4">
                {MOTIVOS.map((m) => (
                  <button
                    key={m.texto}
                    onClick={() => setMotivo(m.texto)}
                    className="rounded-2xl border-4 border-red-600 p-3 text-lg font-bold leading-tight text-red-700 active:bg-red-50 sm:p-6 sm:text-2xl"
                  >
                    <span className="block text-4xl sm:text-5xl">{m.icono}</span>
                    {m.texto}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-xl text-gray-600">Vas a detener este bloque por:</p>
                <p className="mt-2 rounded-2xl border-4 border-red-600 p-4 text-2xl font-extrabold text-red-700 sm:p-5 sm:text-3xl">
                  <span className="mr-3">{MOTIVOS.find((m) => m.texto === motivo)?.icono}</span>
                  {motivo}
                </p>
                {motivo === OTRO && (
                  <label className="mt-4 block text-xl font-bold">
                    Describe el problema
                    <textarea
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value.slice(0, MAX_DESCRIPCION))}
                      rows={3}
                      autoFocus
                      placeholder="Por ejemplo: se fue la luz"
                      className="mt-2 w-full rounded-2xl border-2 border-gray-400 p-3 text-xl font-normal sm:p-4 sm:text-2xl"
                    />
                  </label>
                )}
                <div className="mt-5 grid grid-cols-[1fr_2fr] gap-3">
                  <button
                    onClick={() => {
                      setMotivo(null);
                      setDescripcion("");
                    }}
                    className="rounded-2xl bg-gray-200 py-4 text-xl font-bold sm:py-5 sm:text-2xl"
                  >
                    Cambiar
                  </button>
                  <button onClick={reportar} disabled={faltaDescripcion} className={`${boton} bg-red-600`}>
                    SÍ, REPORTAR
                  </button>
                </div>
              </div>
            )}
            <button onClick={cerrarProblema} className="mt-4 w-full rounded-2xl bg-gray-200 py-3 text-xl font-bold sm:mt-5 sm:py-4 sm:text-2xl">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Contenido({ t, grande = false, verModelo }: { t: Tarjeta; grande?: boolean; verModelo: (t: Tarjeta) => void }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-extrabold text-marca ${grande ? "text-xl sm:text-2xl" : "text-lg"}`}>{t.pedido}</span>
        {t.urgente && (
          <span className="rounded-full bg-red-600 px-3 py-1 text-base font-extrabold text-white">URGENTE</span>
        )}
        <span className={`min-w-0 text-gray-600 truncate ${grande ? "text-lg sm:text-xl" : "text-base"}`}>{t.cliente}</span>
      </div>
      <p className={`font-bold ${grande ? "mt-2 text-2xl leading-tight sm:text-3xl" : "text-lg sm:text-xl"}`}>{t.titulo}</p>
      {t.detalle && <p className={`text-gray-700 ${grande ? "mt-1 text-lg sm:text-xl" : "text-base"}`}>{t.detalle}</p>}
      {grande && (
        <p className="mt-2 text-base text-gray-600 sm:text-lg">
          Capacidad: <b>{t.capacidadDia} por día</b> · Debe tomar <b>{horasEnTexto(t.horasEsperadas)}</b>
          {t.estado !== "en_cola" && (
            <>
              {" "}
              · Lleva{" "}
              <b className={t.horasTranscurridas > t.horasEsperadas * 1.5 ? "text-red-700" : ""}>
                {horasEnTexto(t.horasTranscurridas)}
              </b>
            </>
          )}{" "}
          · Entrega prometida: <b>{fechaCorta(t.fechaPrometida)}</b>
        </p>
      )}
      {t.aviso && <p className="mt-2 inline-block rounded-lg bg-amber-100 px-3 py-1 text-lg font-bold text-amber-900">{t.aviso}</p>}
      {(t.modelos.length > 0 || (grande && t.disenoUrl)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t.modelos.length > 0 && (
            <button
              type="button"
              onClick={() => verModelo(t)}
              className={`rounded-xl bg-marca-suave font-bold text-marca active:scale-95 ${grande ? "px-5 py-3 text-xl" : "px-4 py-2 text-base"}`}
            >
              Ver modelo
            </button>
          )}
          {grande && t.disenoUrl && (
            <a
              href={t.disenoUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-marca-suave px-4 py-3 text-lg font-bold text-marca"
            >
              Ver ficha del diseño
            </a>
          )}
        </div>
      )}
    </>
  );
}
