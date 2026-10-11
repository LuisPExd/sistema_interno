import Link from "next/link";
import { AREAS, ORDEN_AREAS } from "@/lib/catalogo";

const ICONOS: Record<string, string> = {
  almacen: "📦",
  sublimado: "🎨",
  corte: "✂️",
  confeccion: "🧵",
  bordado: "🪡",
  dtf: "🖨️",
  acabados: "✨",
};

export default function Inicio() {
  const tecla =
    "rounded-3xl bg-white p-6 text-center shadow active:scale-95 transition flex flex-col items-center justify-center gap-2 min-h-36";
  return (
    <main className="flex-1 p-6 max-w-5xl w-full mx-auto">
      <h1 className="text-4xl font-extrabold text-marca">Corpotex Planta</h1>
      <p className="mt-1 text-xl text-gray-600">Elige tu área</p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <Link href="/ventas" className={`${tecla} bg-marca! text-white`}>
          <span className="text-5xl">🧾</span>
          <span className="text-3xl font-extrabold">Ventas</span>
        </Link>
        <Link href="/dashboard" className={`${tecla} bg-marca! text-white`}>
          <span className="text-5xl">📊</span>
          <span className="text-3xl font-extrabold">Dashboard</span>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {ORDEN_AREAS.map((a) => (
          <Link key={a} href={`/area/${a}`} className={tecla}>
            <span className="text-5xl">{ICONOS[a]}</span>
            <span className="text-2xl font-bold">{AREAS[a].nombre}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
