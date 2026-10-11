// Piezas de la pantalla de análisis. Son HTML sin JavaScript: cada barra lleva su valor escrito.
import Link from "next/link";

// Un mismo color significa lo mismo en toda la pantalla (validados para daltonismo sobre blanco).
export const COLOR = {
  proceso: "#2a78d6",
  espera: "#86b6ef",
  detenido: "#d03b3b",
  bien: "#0ca30c",
  mal: "#d03b3b",
  pista: "#f1f1ee",
};

export const horas = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} h`;

export function Figura({
  titulo,
  nota,
  children,
  className = "",
}: {
  /** Qué muestra la gráfica, sin interpretarla. */
  titulo: string;
  nota?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={`rounded-2xl bg-white p-5 shadow-sm ${className}`}>
      <figcaption className="text-xl font-extrabold text-gray-900">{titulo}</figcaption>
      {nota && <p className="mt-0.5 text-base text-gray-600">{nota}</p>}
      <div className="mt-4">{children}</div>
    </figure>
  );
}

export function SinDatos({ texto }: { texto: string }) {
  return <p className="rounded-xl bg-gray-100 p-4 text-base text-gray-600">{texto}</p>;
}

export function Leyenda({ items }: { items: { color: string; nombre: string }[] }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-700">
      {items.map((i) => (
        <span key={i.nombre} className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: i.color }} />
          {i.nombre}
        </span>
      ))}
    </p>
  );
}

export function Cifra({
  etiqueta,
  valor,
  detalle,
  tono = "normal",
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: "normal" | "alerta" | "bien";
}) {
  const borde = { normal: "border-gray-200", alerta: "border-red-600", bien: "border-green-600" }[tono];
  return (
    <div className={`rounded-2xl border-l-8 bg-white p-4 shadow-sm ${borde}`}>
      <p className="text-base font-semibold text-gray-600">{etiqueta}</p>
      <p className="mt-1 text-4xl font-extrabold leading-tight text-gray-900">{valor}</p>
      <p className="mt-1 text-base text-gray-700">{detalle}</p>
    </div>
  );
}

export type FilaApilada = {
  clave: string;
  nombre: string;
  /** En el mismo orden que la leyenda. */
  partes: number[];
  texto: string;
  marca?: string;
  href?: string;
  activa?: boolean;
};


/**
 * Barras horizontales apiladas, una por área y en el orden del flujo de la planta.
 * Todas comparten escala, así que la más larga es la que más tiene.
 */
export function BarrasApiladas({
  filas,
  colores,
  textoAbajo = false,
  ancha = false,
  tope: topeFijo,
}: {
  filas: FilaApilada[];
  colores: string[];
  /** Nombres largos (tipos de prenda): la columna del nombre es más ancha. */
  ancha?: boolean;
  /** Valor que ocupa todo el ancho; por defecto, la fila más larga. */
  tope?: number;
  /** En tarjetas angostas el texto va debajo de la barra, para que la barra use todo el ancho. */
  textoAbajo?: boolean;
}) {
  const tope = topeFijo ?? Math.max(...filas.map((f) => f.partes.reduce((n, v) => n + v, 0)), 0);
  return (
    <ul className="space-y-1">
      {filas.map((f) => {
        const contenido = (
          <>
            <span className={`text-lg font-bold text-gray-900 ${ancha ? "leading-tight" : "truncate"}`}>{f.nombre}</span>
            <span className={textoAbajo ? "block min-w-0" : "flex min-w-0 items-center gap-3 max-md:block"}>
              <span
                className={`flex h-6 items-stretch gap-[2px] rounded-r ${textoAbajo ? "" : "flex-1"}`}
                style={{ background: COLOR.pista }}
              >
                {f.partes.map((v, i) =>
                  v > 0 ? (
                    <span
                      key={i}
                      className="last:rounded-r"
                      style={{ width: `${tope ? (v / tope) * 100 : 0}%`, minWidth: 3, background: colores[i] }}
                    />
                  ) : null,
                )}
              </span>
              <span
                className={`text-base leading-tight text-gray-800 ${textoAbajo ? "mt-1 block" : "w-64 shrink-0 max-md:mt-1 max-md:block max-md:w-auto"}`}
              >
                {f.texto}
                {f.marca && (
                  <span className="ml-2 inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-white">
                    {f.marca}
                  </span>
                )}
              </span>
            </span>
          </>
        );
        const clase = `grid ${ancha ? "grid-cols-[14rem_1fr] max-md:grid-cols-[8rem_1fr]" : "grid-cols-[7.5rem_1fr] max-md:grid-cols-[6rem_1fr]"} items-start gap-3 rounded-xl px-2 py-1.5 ${f.activa ? "bg-marca-suave ring-2 ring-marca" : ""}`;
        return (
          <li key={f.clave}>
            {f.href ? (
              <Link href={f.href} scroll={false} className={`${clase} hover:bg-gray-100`}>
                {contenido}
              </Link>
            ) : (
              <div className={clase}>{contenido}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Tabla con fondo más oscuro donde hay más. */
export function TablaDeCalor({
  filas,
  columnas,
  encabezado,
}: {
  filas: { nombre: string; valores: number[]; activa?: boolean }[];
  columnas: string[];
  encabezado: string;
}) {
  const tope = Math.max(...filas.flatMap((f) => f.valores), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-center text-lg tabular-nums">
        <thead>
          <tr className="text-sm text-gray-600">
            <th className="text-left font-semibold">{encabezado}</th>
            {columnas.map((c) => (
              <th key={c} className="px-1 font-semibold">
                {c}
              </th>
            ))}
            <th className="px-2 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre}>
              <th scope="row" className={`whitespace-nowrap pr-3 text-left ${f.activa ? "font-extrabold text-marca" : "font-semibold"}`}>
                {f.nombre}
              </th>
              {f.valores.map((v, i) => {
                const fuerza = tope ? v / tope : 0;
                return (
                  <td
                    key={columnas[i]}
                    className="min-w-14 rounded px-2 py-1.5 font-bold"
                    style={{
                      background: v === 0 ? COLOR.pista : `rgba(42, 120, 214, ${0.18 + fuerza * 0.82})`,
                      // El texto oscuro se lee en todos los tonos; el blanco no, en los medios.
                      color: v === 0 ? "#b4b3ad" : "#0b0b0b",
                    }}
                  >
                    {v === 0 ? "·" : v}
                  </td>
                );
              })}
              <td className="px-2 font-bold">{f.valores.reduce((n, v) => n + v, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
