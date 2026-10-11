import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { exigir, leerAccesos } from "@/lib/acceso";
import { fechaHora } from "@/lib/formato";
import { ROLES, nombreRol } from "@/lib/roles";
import { CambiarPin } from "./CambiarPin";

export default function PaginaAccesos() {
  return (
    <>
      <Cabecera titulo="Accesos y PIN" />
      <Suspense fallback={<Cargando />}>
        <Accesos />
      </Suspense>
    </>
  );
}

async function Accesos() {
  await exigir("accesos");
  const accesos = await leerAccesos();

  return (
    <main className="flex-1 p-5 max-w-3xl w-full mx-auto space-y-4">
      <p className="text-lg text-gray-700">
        Cada área y cada rol entra con su PIN de 4 números. El PIN guardado no se puede ver; si alguien lo olvida, pon
        uno nuevo. Al cambiarlo, las tabletas que usaban el anterior tendrán que volver a entrar.
      </p>
      {ROLES.map((rol) => (
        <article key={rol} className="rounded-2xl bg-white p-4 shadow-sm flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <h2 className="text-xl font-extrabold text-marca">{nombreRol(rol)}</h2>
            <p className="text-base text-gray-600">
              {accesos[rol] ? `Último cambio: ${fechaHora(accesos[rol].actualizado)}` : "Sin PIN: nadie puede entrar"}
            </p>
          </div>
          <CambiarPin rol={rol} />
        </article>
      ))}
    </main>
  );
}
