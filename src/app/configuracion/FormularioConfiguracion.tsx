"use client";

import { useState, useTransition } from "react";
import type { AreaConMinutos, FamiliaId, ValoresPlanta } from "@/lib/catalogo";
import { borrarDatosDemo, cargarDatosDemo, guardarConfiguracion, restaurarConfiguracion } from "./acciones";

type Limite = { min: number; max: number };
type Props = {
  valores: ValoresPlanta;
  deFabrica: ValoresPlanta;
  limites: { minutosPorDia: Limite; almacenPrendasPorDia: Limite; minutosPorPrenda: Limite; bloque: Limite };
  areas: { id: AreaConMinutos; nombre: string }[];
  familias: { id: FamiliaId; nombre: string; seFabrica: boolean }[];
  estado: string;
};

const PERSONALIZACION = [
  { id: "bordado", nombre: "Bordado" },
  { id: "sublimado", nombre: "Sublimado" },
  { id: "dtf", nombre: "DTF" },
] as const;

const ETAPAS = ["corte", "confeccion", "acabados"] as const;

export function FormularioConfiguracion({ valores, deFabrica, limites, areas, familias, estado }: Props) {
  const [v, setV] = useState(valores);
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null);
  const [confirmaRestaurar, setConfirmaRestaurar] = useState(false);
  const [ocupado, iniciar] = useTransition();

  const cambiar = (hacer: (copia: ValoresPlanta) => void) => {
    const copia = structuredClone(v);
    hacer(copia);
    setV(copia);
    setAviso(null);
  };

  const enviar = (accion: () => Promise<{ ok: true } | { ok: false; error: string }>, exito: string) =>
    iniciar(async () => {
      const r = await accion();
      setAviso(r.ok ? { bien: true, texto: exito } : { bien: false, texto: r.error });
      setConfirmaRestaurar(false);
    });

  const titulo = "text-xl font-bold text-gray-600 uppercase tracking-wide";
  const prendasDia = (minutosArea: number, minutosPrenda: number) =>
    minutosPrenda > 0 && minutosArea > 0 ? Math.floor(minutosArea / minutosPrenda) : null;

  return (
    <form
      className="flex-1 p-3 sm:p-5 max-w-5xl w-full mx-auto space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(() => guardarConfiguracion(v), "Cambios guardados");
      }}
    >
      <p className="text-lg text-gray-700">
        Estos valores mueven las fechas que calcula el simulador, aquí y en la página web. Al guardar cambian las
        estimaciones de inmediato; las fechas ya prometidas no se mueven. El tamaño de bloque solo aplica a pedidos
        nuevos. En gris, el valor original. <b>{estado}</b>
      </p>

      <section className="space-y-3">
        <h2 className={titulo}>Capacidad por día</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo
            etiqueta="Almacén"
            unidad="prendas"
            valor={v.almacenPrendasPorDia}
            original={deFabrica.almacenPrendasPorDia}
            limite={limites.almacenPrendasPorDia}
            paso={1}
            alCambiar={(n) => cambiar((c) => (c.almacenPrendasPorDia = n))}
          />
          {areas.map((a) => (
            <Campo
              key={a.id}
              etiqueta={a.nombre}
              unidad="minutos"
              valor={v.minutosPorDia[a.id]}
              original={deFabrica.minutosPorDia[a.id]}
              limite={limites.minutosPorDia}
              paso={1}
              alCambiar={(n) => cambiar((c) => (c.minutosPorDia[a.id] = n))}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={titulo}>Personalización: minutos por prenda</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PERSONALIZACION.map((p) => (
            <Campo
              key={p.id}
              etiqueta={p.nombre}
              unidad={`min · ${prendasDia(v.minutosPorDia[p.id], v.personalizacion[p.id]) ?? "—"} prendas al día`}
              valor={v.personalizacion[p.id]}
              original={deFabrica.personalizacion[p.id]}
              limite={limites.minutosPorPrenda}
              paso={0.1}
              alCambiar={(n) => cambiar((c) => (c.personalizacion[p.id] = n))}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={titulo}>Por tipo de prenda</h2>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-lg">
            <thead className="text-left text-base text-gray-600">
              <tr>
                <th className="px-4 py-3">Prenda</th>
                <th className="px-2 py-3">Corte (min)</th>
                <th className="px-2 py-3">Confección (min)</th>
                <th className="px-2 py-3">Acabados (min)</th>
                <th className="px-2 py-3">Bloque (prendas)</th>
                <th className="px-4 py-3">Confección al día</th>
              </tr>
            </thead>
            <tbody>
              {familias.map((f) => {
                const fila = v.familias[f.id];
                const alDia = prendasDia(v.minutosPorDia.confeccion, fila.confeccion);
                return (
                  <tr key={f.id} className="border-t border-gray-200">
                    <th scope="row" className="px-4 py-2 text-left font-bold">
                      {f.nombre}
                    </th>
                    {ETAPAS.map((etapa) => (
                      <td key={etapa} className="px-2 py-2">
                        {etapa !== "acabados" && !f.seFabrica ? (
                          <span className="text-gray-400">No pasa</span>
                        ) : (
                          <Numero
                            nombre={`${f.nombre}, ${etapa}`}
                            valor={fila[etapa]}
                            original={deFabrica.familias[f.id][etapa]}
                            limite={limites.minutosPorPrenda}
                            paso={0.1}
                            alCambiar={(n) => cambiar((c) => (c.familias[f.id][etapa] = n))}
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <Numero
                        nombre={`${f.nombre}, bloque`}
                        valor={fila.bloque}
                        original={deFabrica.familias[f.id].bloque}
                        limite={limites.bloque}
                        paso={1}
                        alCambiar={(n) => cambiar((c) => (c.familias[f.id].bloque = n))}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-700">{alDia === null ? "—" : `${alDia} prendas`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={titulo}>Datos de simulación</h2>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-lg text-gray-700">
            Carga unos 20 pedidos de ejemplo con 30 días de historia, para mostrar cómo funcionan las tabletas, el
            dashboard y el análisis. No toca los pedidos reales. Mientras estén cargados, las fechas que se ofrecen a
            los clientes salen más largas.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => enviar(cargarDatosDemo, "Datos de simulación cargados")}
              className="rounded-xl bg-marca px-5 py-3 text-lg font-bold text-white active:scale-95 disabled:opacity-50 max-sm:w-full"
            >
              {ocupado ? "Trabajando…" : "Agregar datos de simulación"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => enviar(borrarDatosDemo, "Datos de simulación borrados")}
              className="rounded-xl bg-gray-200 px-5 py-3 text-lg font-bold active:scale-95 disabled:opacity-50 max-sm:w-full"
            >
              Borrar datos de simulación
            </button>
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow sm:p-4">
        {aviso && (
          <span className={`text-lg font-bold ${aviso.bien ? "text-green-700" : "text-red-700"}`} role="status">
            {aviso.texto}
          </span>
        )}
        <div className="flex w-full flex-wrap items-center justify-center gap-3 sm:ml-auto sm:w-auto sm:justify-end">
          {confirmaRestaurar ? (
            <>
              <span className="text-lg font-bold">¿Volver a los valores originales?</span>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => enviar(restaurarConfiguracion, "Valores originales restaurados")}
                className="rounded-xl bg-red-600 px-5 py-3 text-lg font-bold text-white disabled:opacity-50"
              >
                Sí, restaurar
              </button>
              <button
                type="button"
                onClick={() => setConfirmaRestaurar(false)}
                className="rounded-xl bg-gray-200 px-5 py-3 text-lg font-bold"
              >
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmaRestaurar(true)}
              className="rounded-xl bg-gray-200 px-5 py-3 text-lg font-bold"
            >
              Restaurar originales
            </button>
          )}
          <button
            disabled={ocupado}
            className="rounded-xl bg-marca px-7 py-3 text-xl font-extrabold text-white active:scale-95 disabled:opacity-50"
          >
            {ocupado ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </form>
  );
}

type PropsNumero = {
  valor: number;
  original: number;
  limite: Limite;
  paso: number;
  alCambiar: (n: number) => void;
};

function Numero({ nombre, valor, original, limite, paso, alCambiar }: PropsNumero & { nombre: string }) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        aria-label={nombre}
        required
        min={limite.min}
        max={limite.max}
        step={paso}
        value={Number.isNaN(valor) ? "" : valor}
        onChange={(e) => alCambiar(e.target.valueAsNumber)}
        className={`w-24 rounded-lg border-2 px-2 py-1 text-right ${
          valor === original ? "border-gray-300" : "border-acento bg-amber-50 font-bold"
        }`}
      />
      {valor !== original && <span className="text-sm text-gray-400">{original}</span>}
    </span>
  );
}

function Campo({ etiqueta, unidad, ...numero }: PropsNumero & { etiqueta: string; unidad: string }) {
  return (
    <label className="block rounded-2xl bg-white p-4 shadow-sm">
      <span className="block text-lg font-bold text-marca">{etiqueta}</span>
      <Numero nombre={etiqueta} {...numero} />
      <span className="mt-1 block text-base text-gray-600">{unidad}</span>
    </label>
  );
}
