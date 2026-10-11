import Link from "next/link";
import { Suspense } from "react";
import { Cargando } from "@/componentes/Cabecera";
import { sesion } from "@/lib/acceso";
import { ORDEN_AREAS } from "@/lib/catalogo";
import { ROLES, esArea, nombreRol, puede, type Rol } from "@/lib/roles";
import { salir } from "./acceso-acciones";

const ICONOS: Record<Rol, string> = {
  almacen: "📦",
  sublimado: "🎨",
  corte: "✂️",
  confeccion: "🧵",
  bordado: "🪡",
  dtf: "🖨️",
  acabados: "✨",
  ventas: "🧾",
  jefe: "🧭",
  gerencia: "📈",
  admin: "🔑",
};

const tecla =
  "rounded-3xl bg-white p-3 text-center shadow active:scale-95 transition flex flex-col items-center justify-center gap-2 min-h-28 sm:p-6 sm:min-h-36 " +
  // En teléfono van de dos en dos; si sobra una, ocupa toda la fila para que no quede coja.
  "max-sm:last:odd:col-span-2";

export default function Inicio() {
  return (
    <main className="flex-1 p-4 sm:p-6 max-w-5xl w-full mx-auto">
      <h1 className="text-center text-3xl font-extrabold text-marca sm:text-left sm:text-4xl">Corpotex Planta</h1>
      <Suspense fallback={<Cargando />}>
        <Opciones />
      </Suspense>
    </main>
  );
}

async function Opciones() {
  const rol = await sesion();
  return rol ? <Pantallas rol={rol} /> : <Entrada />;
}

/** Sin sesión: se elige quién eres y luego se pide el PIN. */
function Entrada() {
  const oficina = ROLES.filter((r) => !esArea(r));
  return (
    <>
      <p className="mt-1 text-center text-xl text-gray-600 sm:text-left">Elige tu área</p>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {ORDEN_AREAS.map((a) => (
          <Link key={a} href={`/entrar/${a}`} className={tecla}>
            <span className="text-4xl sm:text-5xl">{ICONOS[a]}</span>
            <span className="text-lg font-bold leading-tight sm:text-2xl">{nombreRol(a)}</span>
          </Link>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {oficina.map((r) => (
          <Link key={r} href={`/entrar/${r}`} className={`${tecla} bg-marca! text-white`}>
            <span className="text-4xl sm:text-5xl">{ICONOS[r]}</span>
            <span className="text-lg font-bold leading-tight sm:text-2xl">{nombreRol(r)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

/** Con sesión: solo las pantallas que ese rol puede abrir. */
function Pantallas({ rol }: { rol: Rol }) {
  const oficina = [
    { zona: "ventas", href: "/ventas", icono: "🧾", texto: "Ventas" },
    { zona: "dashboard", href: "/dashboard", icono: "📊", texto: "Dashboard" },
    { zona: "reportes", href: "/reportes", icono: "📑", texto: "Reportes" },
    { zona: "configuracion", href: "/configuracion", icono: "⚙️", texto: "Configuración" },
    { zona: "accesos", href: "/accesos", icono: "🔑", texto: "Accesos y PIN" },
  ] as const;
  const visibles = oficina.filter((o) => puede(rol, o.zona));
  const areas = ORDEN_AREAS.filter((a) => puede(rol, a));

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-start">
        <p className="text-xl text-gray-600">
          Entraste como <b>{nombreRol(rol)}</b>
        </p>
        <form action={salir} className="sm:ml-auto">
          <button className="rounded-xl bg-white px-5 py-3 text-lg font-bold text-marca shadow active:scale-95">
            Salir
          </button>
        </form>
      </div>

      {visibles.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
          {visibles.map((o) => (
            <Link key={o.href} href={o.href} className={`${tecla} bg-marca! text-white`}>
              <span className="text-4xl sm:text-5xl">{o.icono}</span>
              <span className="text-lg font-extrabold leading-tight sm:text-3xl">{o.texto}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {areas.map((a) => (
          <Link key={a} href={`/area/${a}`} className={tecla}>
            <span className="text-4xl sm:text-5xl">{ICONOS[a]}</span>
            <span className="text-lg font-bold leading-tight sm:text-2xl">{nombreRol(a)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
