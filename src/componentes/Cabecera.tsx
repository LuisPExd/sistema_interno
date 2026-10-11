import Link from "next/link";

/** En teléfono las acciones bajan a una segunda fila, centradas; desde tableta van a la derecha. */
export function Cabecera({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <header className="bg-marca text-white px-3 py-2 sm:px-5 sm:py-3 flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4">
      <Link href="/" className="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-base font-semibold active:bg-white/30 sm:px-4 sm:text-lg">
        ← Inicio
      </Link>
      <h1 className="min-w-0 flex-1 text-xl font-bold leading-tight sm:text-2xl">{titulo}</h1>
      {children && (
        <div className="flex w-full flex-wrap items-center justify-center gap-2 text-base sm:w-auto sm:justify-end sm:gap-3 sm:text-lg">
          {children}
        </div>
      )}
    </header>
  );
}

export function Cargando() {
  return <p className="p-10 text-center text-2xl text-gray-500">Cargando…</p>;
}
