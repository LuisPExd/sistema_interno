"use client";

import { useState } from "react";

export type SerieColumnas = { nombre: string; color: string; valores: number[] };

type Props = {
  /** Qué muestra, para lectores de pantalla. */
  descripcion: string;
  etiquetas: string[];
  /** Una serie, o varias apiladas en la misma columna. */
  series: SerieColumnas[];
  /** Línea horizontal de referencia (capacidad, meta). */
  referencia?: { valor: number; texto: string };
  /** Texto extra por columna para el recuadro que aparece al tocar. */
  notas?: string[];
  unidad: string;
  /** Para tarjetas angostas: menos ancho de dibujo, así el texto no se achica. */
  compacta?: boolean;
  /** Los valores son conteos: el eje solo marca números enteros. */
  enteros?: boolean;
};

const ALTO = 250;
const M = { arriba: 22, derecha: 16, abajo: 30, izquierda: 44 };
const TINTA = "#0b0b0b";
const GRIS = "#52514e";
const REJILLA = "#e6e5df";
const SUPERFICIE = "#ffffff";

/** Tope y marcas del eje con números redondos. */
function escala(maximo: number, enteros: boolean): { tope: number; marcas: number[] } {
  if (maximo <= 0) return { tope: 1, marcas: [0, 1] };
  const bruto = maximo / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const redondo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto)!;
  const paso = enteros ? Math.max(1, Math.ceil(redondo)) : redondo;
  const tope = Math.ceil(maximo / paso) * paso;
  return { tope, marcas: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}

const numero = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/** Columnas por periodo. Al pasar el dedo o el cursor muestra los valores de esa columna. */
export function GraficaColumnas({ descripcion, etiquetas, series, referencia, notas, unidad, compacta, enteros }: Props) {
  const ANCHO = compacta ? 480 : 760;
  const [activo, setActivo] = useState<number | null>(null);
  const n = etiquetas.length;
  const totales = etiquetas.map((_, i) => series.reduce((s, x) => s + x.valores[i], 0));
  const { tope, marcas } = escala(Math.max(...totales, referencia?.valor ?? 0), enteros ?? false);

  const banda = (ANCHO - M.izquierda - M.derecha) / n;
  const grosor = Math.max(3, Math.min(24, banda * 0.62));
  const centro = (i: number) => M.izquierda + banda * (i + 0.5);
  const base = ALTO - M.abajo;
  const y = (v: number) => base - (v / tope) * (base - M.arriba);
  // Las etiquetas del eje se saltan para que no se pisen.
  const salto = Math.ceil(n / (compacta ? 6 : 10));
  const mayor = Math.max(...totales);

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - caja.left) / caja.width) * ANCHO;
    setActivo(Math.max(0, Math.min(n - 1, Math.floor((px - M.izquierda) / banda))));
  };

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="w-full touch-pan-y"
          role="img"
          aria-label={descripcion}
          onPointerMove={alMover}
          onPointerDown={alMover}
          onPointerLeave={() => setActivo(null)}
        >
          {marcas.map((v) => (
            <g key={v}>
              <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(v)} y2={y(v)} stroke={REJILLA} strokeWidth={1} />
              <text x={M.izquierda - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill={GRIS}>
                {numero(v)}
              </text>
            </g>
          ))}

          {activo !== null && (
            <rect x={centro(activo) - banda / 2} y={M.arriba} width={banda} height={base - M.arriba} fill="#f1f1ee" />
          )}

          {etiquetas.map((etiqueta, i) => {
            let acumulado = 0;
            return (
              <g key={i}>
                {series.map((s, k) => {
                  const v = s.valores[i];
                  if (v <= 0) return null;
                  const arriba = y(acumulado + v);
                  // 2 px de separación entre los tramos apilados.
                  const alto = y(acumulado) - arriba - (acumulado > 0 ? 2 : 0);
                  acumulado += v;
                  const esUltimo = series.slice(k + 1).every((x) => x.valores[i] <= 0);
                  const r = esUltimo ? Math.min(4, grosor / 2, Math.max(0, alto)) : 0;
                  const x0 = centro(i) - grosor / 2;
                  return (
                    <path
                      key={s.nombre}
                      d={`M${x0},${arriba + alto} V${arriba + r} Q${x0},${arriba} ${x0 + r},${arriba} H${x0 + grosor - r} Q${x0 + grosor},${arriba} ${x0 + grosor},${arriba + r} V${arriba + alto} Z`}
                      fill={s.color}
                    />
                  );
                })}
                {/* Solo se rotula la columna más alta; el resto se lee con el eje o al tocar. */}
                {totales[i] === mayor && mayor > 0 && totales.indexOf(mayor) === i && activo === null && (
                  <text x={centro(i)} y={y(totales[i]) - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill={TINTA}>
                    {numero(totales[i])}
                  </text>
                )}
                {(i % salto === 0 || i === activo) && (activo === null || i === activo || Math.abs(i - activo) >= salto) && (
                  <text
                    x={centro(i)}
                    y={ALTO - 9}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={i === activo ? 700 : 400}
                    fill={i === activo ? TINTA : GRIS}
                  >
                    {etiqueta}
                  </text>
                )}
              </g>
            );
          })}

          <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={base} y2={base} stroke={GRIS} strokeWidth={1} />

          {referencia && referencia.valor > 0 && (
            <g>
              <line
                x1={M.izquierda}
                x2={ANCHO - M.derecha}
                y1={y(referencia.valor)}
                y2={y(referencia.valor)}
                stroke={GRIS}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <text
                x={ANCHO - M.derecha}
                y={y(referencia.valor) - 6}
                textAnchor="end"
                fontSize={12}
                fontWeight={700}
                fill={TINTA}
                stroke={SUPERFICIE}
                strokeWidth={4}
                paintOrder="stroke"
              >
                {referencia.texto}
              </text>
            </g>
          )}
        </svg>

        {activo !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-lg"
            style={
              activo > (n - 1) / 2
                ? { right: `${100 - ((centro(activo) - banda / 2) / ANCHO) * 100}%` }
                : { left: `${((centro(activo) + banda / 2) / ANCHO) * 100}%` }
            }
          >
            <p className="font-bold">{etiquetas[activo]}</p>
            {series.map((s) => (
              <p key={s.nombre} className="flex items-center gap-2 whitespace-nowrap">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
                <b>{numero(s.valores[activo])}</b> {s.nombre.toLowerCase()}
              </p>
            ))}
            {notas?.[activo] && <p className="mt-1 text-gray-600">{notas[activo]}</p>}
          </div>
        )}
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-700">
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.nombre} className="inline-flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
              {s.nombre}
            </span>
          ))}
        {referencia && referencia.valor > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: GRIS }} />
            Capacidad
          </span>
        )}
        <span className="text-gray-500">{unidad}</span>
      </p>

      <details className="mt-1 text-sm">
        <summary className="cursor-pointer font-semibold text-marca">Ver los números</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-right tabular-nums">
            <thead>
              <tr className="text-gray-600">
                <th className="text-left font-semibold">Periodo</th>
                {series.map((s) => (
                  <th key={s.nombre} className="font-semibold">
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {etiquetas.map((etiqueta, i) => (
                <tr key={i} className="border-t border-gray-200">
                  <td className="text-left">{etiqueta}</td>
                  {series.map((s) => (
                    <td key={s.nombre}>{numero(s.valores[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
