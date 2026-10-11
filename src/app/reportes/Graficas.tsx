// Gráficas de los reportes. Son HTML sin JavaScript: cada barra lleva su valor escrito al lado.

// Azul validado para daltonismo sobre blanco (el mismo de la gráfica mensual); el gris es la referencia.
const AZUL = "#2a78d6";
const GRIS = "#52514e";

export function Figura({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <figure className="rounded-2xl bg-white p-4 shadow-sm">
      <figcaption className="text-xl font-bold">{titulo}</figcaption>
      <p className="text-base text-gray-600">{nota}</p>
      <div className="mt-3">{children}</div>
    </figure>
  );
}

export function SinDatos({ texto }: { texto: string }) {
  return <p className="rounded-xl bg-gray-100 p-4 text-lg text-gray-600">{texto}</p>;
}

export type Barra = { nombre: string; valor: number; texto: string };

/** Barras horizontales de una sola medida, de mayor a menor si `ordenar`. */
export function Barras({ filas, ordenar = true }: { filas: Barra[]; ordenar?: boolean }) {
  const tope = Math.max(...filas.map((f) => f.valor), 0);
  const lista = ordenar ? [...filas].sort((a, b) => b.valor - a.valor) : filas;
  return (
    <ul className="space-y-2">
      {lista.map((f) => (
        <li key={f.nombre} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-lg">
          <span className="truncate font-semibold">{f.nombre}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-5 rounded-r"
              style={{ width: `${tope ? (f.valor / tope) * 70 : 0}%`, minWidth: f.valor > 0 ? 3 : 0, background: AZUL }}
            />
            <span className="whitespace-nowrap text-gray-800">{f.texto}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export type Comparada = { nombre: string; real: number; plan: number; texto: string };

/** Barra de lo real con una marca vertical en lo planificado: si la barra pasa la marca, el área se retrasó. */
export function BarrasConPlan({ filas }: { filas: Comparada[] }) {
  const tope = Math.max(...filas.flatMap((f) => [f.real, f.plan]), 0);
  const ancho = (v: number) => (tope ? (v / tope) * 100 : 0);
  return (
    <>
      <ul className="space-y-3">
        {filas.map((f) => (
          <li key={f.nombre} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-lg">
            <span className="truncate font-semibold">{f.nombre}</span>
            <span>
              <span className="relative block h-6 rounded-r bg-[#f1f1ee]">
                <span
                  className="absolute inset-y-0.5 left-0 rounded-r"
                  style={{ width: `${ancho(f.real)}%`, minWidth: f.real > 0 ? 3 : 0, background: AZUL }}
                />
                {f.plan > 0 && (
                  <span
                    className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded"
                    style={{ left: `${ancho(f.plan)}%`, background: GRIS, outline: "2px solid #fff" }}
                  />
                )}
              </span>
              <span className="block text-base text-gray-700">{f.texto}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-700">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-6 rounded-r" style={{ background: AZUL }} />
          Horas reales
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-4 w-[3px] rounded" style={{ background: GRIS }} />
          Horas planificadas
        </span>
      </p>
    </>
  );
}

/** Tabla con fondo más oscuro donde hay más: áreas en filas, meses en columnas. */
export function TablaDeCalor({
  filas,
  columnas,
}: {
  filas: { nombre: string; valores: number[] }[];
  columnas: string[];
}) {
  const tope = Math.max(...filas.flatMap((f) => f.valores), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-center text-lg">
        <thead>
          <tr className="text-base text-gray-600">
            <th className="text-left font-semibold">Área</th>
            {columnas.map((c) => (
              <th key={c} className="font-semibold">
                {c}
              </th>
            ))}
            <th className="font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre}>
              <th scope="row" className="whitespace-nowrap pr-3 text-left font-semibold">
                {f.nombre}
              </th>
              {f.valores.map((v, i) => {
                const fuerza = tope ? v / tope : 0;
                return (
                  <td
                    key={columnas[i]}
                    className="min-w-12 rounded px-2 py-1.5 font-bold"
                    style={{
                      background: v === 0 ? "#f1f1ee" : `rgba(42, 120, 214, ${0.18 + fuerza * 0.82})`,
                      color: v === 0 ? "#8a8985" : fuerza > 0.5 ? "#fff" : "#0b0b0b",
                    }}
                  >
                    {v}
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
