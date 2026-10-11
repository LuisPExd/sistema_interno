"use client";

import { useState } from "react";
import type { MesHistoria } from "@/lib/historiaSimulada";

// Colores validados para daltonismo sobre blanco; la capacidad va en gris porque es la referencia.
const SERIES = [
  { clave: "aceptadas", nombre: "Prendas aceptadas", color: "#2a78d6" },
  { clave: "aTiempo", nombre: "Entregadas a tiempo", color: "#1baf7a" },
] as const;
const GRIS = "#52514e";
const REJILLA = "#e1e0d9";

const ANCHO = 760;
const ALTO = 300;
const M = { arriba: 24, derecha: 150, abajo: 34, izquierda: 48 };

/** Líneas por mes: lo aceptado y lo entregado a tiempo, frente a la capacidad fija de la planta. */
export function GraficaMensual({ meses, capacidad }: { meses: MesHistoria[]; capacidad: number }) {
  const [activo, setActivo] = useState<number | null>(null);

  const tope = Math.ceil((Math.max(capacidad, ...meses.map((m) => m.aceptadas)) * 1.1) / 200) * 200;
  const x = (i: number) => M.izquierda + (i * (ANCHO - M.izquierda - M.derecha)) / (meses.length - 1);
  const y = (v: number) => ALTO - M.abajo - (v / tope) * (ALTO - M.arriba - M.abajo);
  const marcas = Array.from({ length: tope / 200 + 1 }, (_, i) => i * 200).filter((v) => v % 400 === 0);
  const ultimo = meses.length - 1;

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - caja.left) / caja.width) * ANCHO;
    const paso = (ANCHO - M.izquierda - M.derecha) / (meses.length - 1);
    setActivo(Math.max(0, Math.min(ultimo, Math.round((px - M.izquierda) / paso))));
  };

  const sobre = meses.filter((m) => m.aceptadas > capacidad).length;
  const mes = activo === null ? null : meses[activo];

  return (
    <figure className="rounded-2xl bg-white p-4 shadow-sm">
      <figcaption className="text-xl font-bold">Pedidos aceptados frente a la capacidad de la planta</figcaption>
      <p className="text-base text-gray-600">
        Prendas por mes, últimos 12 meses. <b>Datos simulados</b>: se reemplazan cuando el sistema acumule historial real.
      </p>

      <div className="relative mt-2 max-w-5xl">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="w-full touch-none"
          role="img"
          aria-label="Prendas aceptadas y entregadas a tiempo por mes, frente a la capacidad mensual"
          onPointerMove={alMover}
          onPointerDown={alMover}
          onPointerLeave={() => setActivo(null)}
        >
          {marcas.map((v) => (
            <g key={v}>
              <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(v)} y2={y(v)} stroke={REJILLA} strokeWidth={1} />
              <text x={M.izquierda - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill={GRIS}>
                {v}
              </text>
            </g>
          ))}
          {meses.map((m, i) => (
            <text key={m.mes} x={x(i)} y={ALTO - 12} textAnchor="middle" fontSize={12} fill={GRIS}>
              {m.etiqueta}
            </text>
          ))}

          {/* Capacidad: línea fija de referencia. */}
          <line
            x1={M.izquierda}
            x2={ANCHO - M.derecha}
            y1={y(capacidad)}
            y2={y(capacidad)}
            stroke={GRIS}
            strokeWidth={2}
            strokeDasharray="6 5"
          />
          <text x={x(5.4)} y={y(capacidad) - 8} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0b0b0b">
            Capacidad: {capacidad} por mes
          </text>

          {activo !== null && (
            <line x1={x(activo)} x2={x(activo)} y1={M.arriba} y2={ALTO - M.abajo} stroke={GRIS} strokeWidth={1} />
          )}

          {SERIES.map((s) => (
            <g key={s.clave}>
              <polyline
                points={meses.map((m, i) => `${x(i)},${y(m[s.clave])}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {meses.map((m, i) => (
                <circle
                  key={m.mes}
                  cx={x(i)}
                  cy={y(m[s.clave])}
                  r={i === activo ? 5.5 : 4}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
              <text
                x={x(ultimo) + 10}
                y={y(meses[ultimo][s.clave]) + (s.clave === "aceptadas" ? -4 : 14)}
                fontSize={13}
                fontWeight={700}
                fill="#0b0b0b"
              >
                {s.nombre}
              </text>
            </g>
          ))}
        </svg>

        {mes && activo !== null && (
          <div
            className="pointer-events-none absolute top-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-lg"
            style={
              activo > ultimo / 2
                ? { right: `${100 - (x(activo) / ANCHO) * 100 + 2}%` }
                : { left: `${(x(activo) / ANCHO) * 100 + 2}%` }
            }
          >
            <p className="font-bold">{mes.etiqueta}</p>
            {SERIES.map((s) => (
              <p key={s.clave} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-4" style={{ background: s.color }} />
                <b>{mes[s.clave]}</b> {s.nombre.toLowerCase()}
              </p>
            ))}
            <p className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-4" style={{ background: GRIS }} />
              <b>{capacidad}</b> de capacidad
            </p>
            {mes.aceptadas > capacidad && (
              <p className="mt-1 font-bold text-red-700">Se aceptaron {mes.aceptadas - capacidad} más de lo que se puede producir.</p>
            )}
          </div>
        )}
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-700">
        {SERIES.map((s) => (
          <span key={s.clave} className="inline-flex items-center gap-2">
            <span className="inline-block h-[3px] w-6 rounded" style={{ background: s.color }} />
            {s.nombre}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: GRIS }} />
          Capacidad de la planta
        </span>
      </p>

      <p className="mt-3 rounded-xl bg-marca-suave p-3 text-lg">
        {sobre === 0 ? (
          "En ningún mes se aceptó más de lo que la planta puede producir."
        ) : (
          <>
            En <b>{sobre} de los últimos 12 meses</b> se aceptó más de lo que la planta puede producir. En esos meses la línea
            azul pasa la capacidad y las entregas a tiempo no la alcanzan: lo que sobra se atrasa.
          </>
        )}
      </p>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-marca">Ver los números</summary>
        <table className="mt-2 w-full text-right">
          <thead>
            <tr className="text-gray-600">
              <th className="text-left font-semibold">Mes</th>
              <th className="font-semibold">Aceptadas</th>
              <th className="font-semibold">A tiempo</th>
              <th className="font-semibold">Capacidad</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className="border-t border-gray-200">
                <td className="text-left">{m.etiqueta}</td>
                <td>{m.aceptadas}</td>
                <td>{m.aTiempo}</td>
                <td>{capacidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
