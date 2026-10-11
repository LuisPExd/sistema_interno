import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecera, Cargando } from "@/componentes/Cabecera";
import { esRol, nombreRol } from "@/lib/roles";
import { Teclado } from "./Teclado";

type Props = { params: Promise<{ rol: string }> };

export default function PaginaEntrar({ params }: Props) {
  return (
    <Suspense fallback={<Cargando />}>
      <Entrar params={params} />
    </Suspense>
  );
}

async function Entrar({ params }: Props) {
  const { rol } = await params;
  if (!esRol(rol)) notFound();
  return (
    <>
      <Cabecera titulo={nombreRol(rol)} />
      <Teclado rol={rol} />
    </>
  );
}
