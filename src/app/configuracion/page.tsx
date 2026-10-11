import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { exigir } from "@/lib/acceso";
import { AREAS, AREAS_CON_MINUTOS, FAMILIAS, IDS_FAMILIA, VALORES_DE_FABRICA } from "@/lib/catalogo";
import { LIMITES, completar, leerConfiguracion } from "@/lib/configuracion";
import { fechaHora } from "@/lib/formato";
import { FormularioConfiguracion } from "./FormularioConfiguracion";

export default function PaginaConfiguracion() {
  return (
    <>
      <Cabecera titulo="Configuración de planta" />
      <Suspense fallback={<Cargando />}>
        <Configuracion />
      </Suspense>
    </>
  );
}

async function Configuracion() {
  await exigir("configuracion");
  const guardado = await leerConfiguracion();
  const { valores } = completar(guardado?.valor);

  return (
    <FormularioConfiguracion
      // Al guardar o restaurar cambia la fecha y el formulario se vuelve a llenar.
      key={guardado?.actualizado ?? "fabrica"}
      valores={valores}
      deFabrica={VALORES_DE_FABRICA}
      limites={LIMITES}
      areas={AREAS_CON_MINUTOS.map((id) => ({ id, nombre: AREAS[id].nombre }))}
      familias={IDS_FAMILIA.map((id) => ({ id, nombre: FAMILIAS[id].nombre, seFabrica: FAMILIAS[id].seFabrica }))}
      estado={guardado ? `Último cambio: ${fechaHora(guardado.actualizado)}` : "Se están usando los valores originales."}
    />
  );
}
