"use client";

import { useTransition } from "react";
import { entregarPedido } from "@/app/acciones";

export function BotonEntregar({ id }: { id: number }) {
  const [ocupado, iniciar] = useTransition();
  return (
    <button
      disabled={ocupado}
      onClick={() => iniciar(() => entregarPedido(id))}
      className="rounded-xl bg-green-600 px-5 py-2 text-lg font-bold text-white active:scale-95 disabled:opacity-50"
    >
      Marcar entregado
    </button>
  );
}
