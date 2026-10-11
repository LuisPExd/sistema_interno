import Link from "next/link";

export function Cabecera({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <header className="bg-marca text-white px-5 py-3 flex items-center gap-4">
      <Link href="/" className="rounded-xl bg-white/15 px-4 py-2 text-lg font-semibold active:bg-white/30">
        ← Inicio
      </Link>
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <div className="ml-auto flex items-center gap-3 text-lg">{children}</div>
    </header>
  );
}

export function Cargando() {
  return <p className="p-10 text-center text-2xl text-gray-500">Cargando…</p>;
}
