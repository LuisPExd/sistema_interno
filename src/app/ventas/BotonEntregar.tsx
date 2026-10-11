"use client";

import { useTransition } from "react";
import { entregarPedido } from "@/app/acciones";

export function BotonEntregar({ id }: { id: number }) {
  const [ocupado, iniciar] = useTransition();
  return (
    <button
      disabled={ocupado}
      onClick={() => iniciar(() => entregarPedido(id))}
      className="w-full rounded-xl bg-green-600 px-5 py-3 text-lg sm:w-auto sm:py-2 font-bold text-white active:scale-95 disabled:opacity-50"
    >
      Marcar entregado
    </button>
  );
}
